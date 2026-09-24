/**
 * Wantlist data access — the only place route code touches `wantlist_entries`, the same convention
 * `decks.ts`, `folders.ts`, `collection.ts` and `binders.ts` follow.
 *
 * A **Wantlist** describes cards that are absent (`CONTEXT.md`). It is not the inverse of the
 * Collection and nothing here consults it: what you own is a fact, what you want is a decision, and
 * a card can be both (a second copy) or neither. `Missing` on a deck is a third thing again —
 * computed per Deck, never stored.
 *
 * Wantlists share `printing_lists` with Binders, so naming, visibility and ownership all work the
 * same way and live in `binders.ts`'s equivalents. Only the entries differ, which is exactly why
 * they are a separate table.
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { WantlistSummary } from '#lib/collection/wantlists.js';
import type { getDb } from './index.js';
import { printingLists, user, wantlistEntries } from './schema.js';

type Db = ReturnType<typeof getDb>;
type Visibility = NonNullable<(typeof printingLists.$inferInsert)['visibility']>;

/** Matches `collection_items`' cap: a number this size is a typo, not a want. */
const MAX_QUANTITY = 999;

export type WantlistEntry = {
	printingId: string;
	quantity: number;
	note: string | null;
};

export async function listWantlists(db: Db, ownerId: string): Promise<WantlistSummary[]> {
	const lists = await db
		.select({
			id: printingLists.id,
			name: printingLists.name,
			visibility: printingLists.visibility,
			isDefault: printingLists.isDefault
		})
		.from(printingLists)
		.where(and(eq(printingLists.ownerId, ownerId), eq(printingLists.kind, 'wantlist')))
		// Default first: it is the one every other surface means when it says "the wantlist".
		.orderBy(desc(printingLists.isDefault), asc(printingLists.createdAt));

	if (lists.length === 0) return [];

	// Aggregated in SQL rather than in JS, unlike `listBinders`: a count and a sum are exactly what
	// SQL is for, and unlike a Binder's cover there is no ordered-first-row problem to dodge.
	const totals = await db
		.select({
			listId: wantlistEntries.listId,
			entries: sql<number>`count(*)`,
			copies: sql<number>`sum(${wantlistEntries.quantity})`
		})
		.from(wantlistEntries)
		.where(
			inArray(
				wantlistEntries.listId,
				lists.map((list) => list.id)
			)
		)
		.groupBy(wantlistEntries.listId);

	return lists.map((list) => {
		const total = totals.find((row) => row.listId === list.id);
		return {
			...list,
			entries: total?.entries ?? 0,
			copies: total?.copies ?? 0,
			// A lone list is the default in effect, whatever the column says — see `defaultWantlist`.
			isDefault: list.isDefault || lists.length === 1
		};
	});
}

/** Joined with the owner's display name, for the shared view's "by {name}" attribution. */
export async function getWantlist(db: Db, id: string) {
	const [row] = await db
		.select({ list: printingLists, ownerName: user.name })
		.from(printingLists)
		.innerJoin(user, eq(user.id, printingLists.ownerId))
		.where(and(eq(printingLists.id, id), eq(printingLists.kind, 'wantlist')));

	return row ? { ...row.list, ownerName: row.ownerName } : null;
}

/**
 * The entries, newest first.
 *
 * A Wantlist is unordered (`CONTEXT.md`), so *some* order has to be chosen for display, and
 * recency is the one that matches how the list is used: you add what you're currently after, and
 * the thing you just added is the thing you want to see. Set-and-number order belongs to the
 * Collection, which is a checklist against a printed sequence; a Wantlist is not.
 */
export async function getWantlistEntries(db: Db, listId: string): Promise<WantlistEntry[]> {
	return db
		.select({
			printingId: wantlistEntries.printingId,
			quantity: wantlistEntries.quantity,
			note: wantlistEntries.note
		})
		.from(wantlistEntries)
		.where(eq(wantlistEntries.listId, listId))
		.orderBy(desc(wantlistEntries.updatedAt));
}

export async function createWantlist(db: Db, ownerId: string, name: string) {
	// The first Wantlist becomes the default, because a lone list is unambiguously the one meant —
	// and it means the collection view's "want this" works without a separate setup step.
	const [existing] = await db
		.select({ id: printingLists.id })
		.from(printingLists)
		.where(and(eq(printingLists.ownerId, ownerId), eq(printingLists.kind, 'wantlist')))
		.limit(1);

	const [wantlist] = await db
		.insert(printingLists)
		.values({ ownerId, kind: 'wantlist', name, isDefault: existing === undefined })
		.returning();
	return wantlist;
}

/**
 * Designates the list that other surfaces add to, clearing whatever held the title before.
 *
 * Both statements in one batch, which D1 runs in a transaction: "at most one default per owner and
 * kind" is an application invariant SQLite can't express as a constraint, so the only way to keep
 * it true is to never leave the intermediate state visible.
 *
 * Takes `ownerId` as well as the id so the clear is scoped to that owner — a caller that has
 * already checked ownership still shouldn't be able to reach across users by mistake.
 */
export async function setDefaultWantlist(db: Db, ownerId: string, id: string): Promise<void> {
	await db.batch([
		db
			.update(printingLists)
			.set({ isDefault: false })
			.where(and(eq(printingLists.ownerId, ownerId), eq(printingLists.kind, 'wantlist'))),
		db
			.update(printingLists)
			.set({ isDefault: true })
			.where(and(eq(printingLists.id, id), eq(printingLists.ownerId, ownerId)))
	]);
}

/**
 * The list to add to when nobody named one — the default, or the only one, or nothing.
 *
 * "The only one" is deliberate: a user with a single Wantlist has already answered the question,
 * and making them mark it explicitly would be bureaucracy. Returns `null` rather than creating
 * anything, so a caller decides whether to prompt.
 */
export async function defaultWantlist(
	db: Db,
	ownerId: string
): Promise<{ id: string; name: string } | null> {
	const lists = await db
		.select({ id: printingLists.id, name: printingLists.name, isDefault: printingLists.isDefault })
		.from(printingLists)
		.where(and(eq(printingLists.ownerId, ownerId), eq(printingLists.kind, 'wantlist')))
		.orderBy(desc(printingLists.isDefault), asc(printingLists.createdAt));

	if (lists.length === 0) return null;
	const chosen = lists.find((list) => list.isDefault) ?? (lists.length === 1 ? lists[0] : null);
	return chosen ? { id: chosen.id, name: chosen.name } : null;
}

/**
 * Sets how many copies of a Printing are wanted, **absolutely** rather than as a delta.
 *
 * Same contract as `setQuantities` in `collection.ts` and for the same reason: a delta that arrives
 * twice is wrong twice over, where an absolute value is merely stale. Zero removes the entry,
 * because a Wantlist asking for nought copies of a card is just a card it doesn't mention.
 */
export async function setWanted(
	db: Db,
	listId: string,
	printingId: string,
	quantity: number,
	note?: string | null
): Promise<void> {
	if (quantity <= 0) {
		await db
			.delete(wantlistEntries)
			.where(and(eq(wantlistEntries.listId, listId), eq(wantlistEntries.printingId, printingId)));
		return;
	}

	const capped = Math.min(Math.trunc(quantity), MAX_QUANTITY);

	await db
		.insert(wantlistEntries)
		.values({ listId, printingId, quantity: capped, note: note ?? null })
		.onConflictDoUpdate({
			target: [wantlistEntries.listId, wantlistEntries.printingId],
			// `note` is only overwritten when one was supplied, so bumping a quantity from the
			// stepper can't silently wipe what somebody typed.
			set: {
				quantity: capped,
				updatedAt: new Date(),
				...(note === undefined ? {} : { note })
			}
		});
}

/**
 * Adds copies to whatever is already wanted, creating the entry if it's new.
 *
 * The one place a delta is the right shape: "add the cards this deck is missing" is additive by
 * nature, and two decks needing the same card should ask for both. `excluded` is SQLite's handle on
 * the row that failed to insert, so the sum happens in the database rather than as a read followed
 * by a write that can race.
 */
export async function addWanted(
	db: Db,
	listId: string,
	printingId: string,
	quantity: number
): Promise<void> {
	if (quantity <= 0) return;

	await db
		.insert(wantlistEntries)
		.values({ listId, printingId, quantity: Math.trunc(quantity) })
		.onConflictDoUpdate({
			target: [wantlistEntries.listId, wantlistEntries.printingId],
			set: {
				quantity: sql`min(${wantlistEntries.quantity} + excluded.quantity, ${MAX_QUANTITY})`,
				updatedAt: new Date()
			}
		});
}

export async function clearWanted(db: Db, listId: string, printingId: string): Promise<void> {
	await setWanted(db, listId, printingId, 0);
}

export async function renameWantlist(db: Db, id: string, name: string): Promise<void> {
	await db.update(printingLists).set({ name }).where(eq(printingLists.id, id));
}

export async function setWantlistVisibility(
	db: Db,
	id: string,
	visibility: Visibility
): Promise<void> {
	await db.update(printingLists).set({ visibility }).where(eq(printingLists.id, id));
}

export async function deleteWantlist(db: Db, id: string): Promise<void> {
	// Entries go with it via `ON DELETE cascade`.
	await db.delete(printingLists).where(eq(printingLists.id, id));
}
