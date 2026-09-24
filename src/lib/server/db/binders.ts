/**
 * Binder data access — the only place route code touches `printing_lists` and `binder_pockets`,
 * the same convention `decks.ts`, `folders.ts` and `collection.ts` follow.
 *
 * A **Binder** is a showcase: presence in one means a wish to display the card, never ownership
 * (`docs/adr/0003-the-collection-is-flat-and-binders-are-showcases.md`). Nothing here consults
 * the Collection, and nothing here can change it.
 *
 * Every mutation takes the Binder's id and the caller is responsible for having checked
 * ownership — `requireOwnedBinder` in the routes does that, mirroring `requireOwnedDeck`. The
 * functions do not re-check, so a caller that forgets is a bug in the route rather than a silent
 * partial failure here.
 */
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { POCKETS_PER_PAGE, type BinderSummary } from '#lib/collection/binders.js';
import type { getDb } from './index.js';
import { binderPockets, printingLists, user } from './schema.js';

type Db = ReturnType<typeof getDb>;
type Visibility = NonNullable<(typeof printingLists.$inferInsert)['visibility']>;

export async function listBinders(db: Db, ownerId: string): Promise<BinderSummary[]> {
	const lists = await db
		.select({
			id: printingLists.id,
			name: printingLists.name,
			visibility: printingLists.visibility
		})
		.from(printingLists)
		.where(and(eq(printingLists.ownerId, ownerId), eq(printingLists.kind, 'binder')))
		.orderBy(asc(printingLists.createdAt));

	if (lists.length === 0) return [];

	// One extra query rather than N, and bucketed in JS rather than in SQL: the list screen shows
	// each Binder's whole first Page, which in SQL is a filter plus a per-list pivot into nine
	// columns. A user's pockets number in the hundreds at most, so fetching them all and grouping
	// here is both cheaper and far easier to read.
	const pockets = await db
		.select({
			listId: binderPockets.listId,
			page: binderPockets.page,
			pocket: binderPockets.pocket,
			printingId: binderPockets.printingId
		})
		.from(binderPockets)
		.where(
			inArray(
				binderPockets.listId,
				lists.map((list) => list.id)
			)
		);

	return lists.map((list) => {
		const own = pockets
			.filter((row) => row.listId === list.id)
			.sort((a, b) => a.page - b.page || a.pocket - b.pocket);

		const firstPage: (string | null)[] = Array.from({ length: POCKETS_PER_PAGE }, () => null);
		for (const row of own) {
			if (row.page === 0 && row.pocket < POCKETS_PER_PAGE) firstPage[row.pocket] = row.printingId;
		}

		return {
			...list,
			filled: own.length,
			// An empty Binder is one empty Page, not zero pages.
			pageCount: own.length === 0 ? 1 : own[own.length - 1].page + 1,
			firstPage
		};
	});
}

/** Joined with the owner's display name, for the shared view's "by {name}" attribution. */
export async function getBinder(db: Db, id: string) {
	const [row] = await db
		.select({ list: printingLists, ownerName: user.name })
		.from(printingLists)
		.innerJoin(user, eq(user.id, printingLists.ownerId))
		.where(and(eq(printingLists.id, id), eq(printingLists.kind, 'binder')));

	return row ? { ...row.list, ownerName: row.ownerName } : null;
}

/**
 * The Binder's pages, as an array of Pockets per page — `null` for an empty Pocket.
 *
 * Rehydrated into a dense shape here rather than in the route, because "an absent row is a held
 * space" is a storage detail and every consumer wants a Page it can render. Always returns at
 * least one page: a Binder with nothing in it is an empty Page, not zero pages.
 */
export async function getBinderPages(db: Db, listId: string): Promise<(string | null)[][]> {
	const rows = await db
		.select({
			page: binderPockets.page,
			pocket: binderPockets.pocket,
			printingId: binderPockets.printingId
		})
		.from(binderPockets)
		.where(eq(binderPockets.listId, listId));

	// `pageCount` comes from the highest occupied page, so trailing empty pages are not persisted
	// — an empty Page at the end is indistinguishable from not having added it yet, and treating
	// them as the same thing means "+ Page" needs no row of its own.
	const highest = rows.reduce((max, row) => Math.max(max, row.page), 0);
	const pages: (string | null)[][] = Array.from({ length: highest + 1 }, () =>
		Array.from({ length: POCKETS_PER_PAGE }, () => null)
	);

	for (const row of rows) {
		// Guards against a row left behind by a future change to `POCKETS_PER_PAGE`, which would
		// otherwise write past the end of a page and read back as `undefined`.
		if (row.pocket < POCKETS_PER_PAGE) pages[row.page][row.pocket] = row.printingId;
	}

	return pages;
}

export async function createBinder(db: Db, ownerId: string, name: string) {
	const [binder] = await db
		.insert(printingLists)
		.values({ ownerId, kind: 'binder', name })
		.returning();
	return binder;
}

export async function renameBinder(db: Db, id: string, name: string): Promise<void> {
	await db.update(printingLists).set({ name }).where(eq(printingLists.id, id));
}

export async function setBinderVisibility(
	db: Db,
	id: string,
	visibility: Visibility
): Promise<void> {
	await db.update(printingLists).set({ visibility }).where(eq(printingLists.id, id));
}

export async function deleteBinder(db: Db, id: string): Promise<void> {
	// Pockets go with it via `ON DELETE cascade`.
	await db.delete(printingLists).where(eq(printingLists.id, id));
}

/** Puts a Printing in a Pocket, replacing whatever was there. */
export async function setPocket(
	db: Db,
	listId: string,
	page: number,
	pocket: number,
	printingId: string
): Promise<void> {
	await db
		.insert(binderPockets)
		.values({ listId, page, pocket, printingId })
		.onConflictDoUpdate({
			target: [binderPockets.listId, binderPockets.page, binderPockets.pocket],
			set: { printingId }
		});
}

/** Empties a Pocket — deleting the row, since a held space is the absence of one. */
export async function clearPocket(
	db: Db,
	listId: string,
	page: number,
	pocket: number
): Promise<void> {
	await db
		.delete(binderPockets)
		.where(
			and(
				eq(binderPockets.listId, listId),
				eq(binderPockets.page, page),
				eq(binderPockets.pocket, pocket)
			)
		);
}

/**
 * Moves a Pocket's contents to another Pocket, **swapping** if the destination is occupied.
 *
 * Swap rather than overwrite, because the gesture is drag-and-drop: dragging a card onto an
 * occupied pocket in a real binder means trading their places, and an overwrite would silently
 * destroy a card the user can't see themselves losing.
 *
 * Both rows are deleted before either is inserted. `(list_id, page, pocket)` is unique, so writing
 * the destination first would collide with the row still sitting there; D1 runs the batch in a
 * transaction, so the intermediate state where neither exists is never observable.
 */
export async function movePocket(
	db: Db,
	listId: string,
	from: { page: number; pocket: number },
	to: { page: number; pocket: number }
): Promise<void> {
	if (from.page === to.page && from.pocket === to.pocket) return;

	const at = (position: { page: number; pocket: number }) =>
		and(
			eq(binderPockets.listId, listId),
			eq(binderPockets.page, position.page),
			eq(binderPockets.pocket, position.pocket)
		);

	const rows = await db
		.select({
			page: binderPockets.page,
			pocket: binderPockets.pocket,
			printingId: binderPockets.printingId
		})
		.from(binderPockets)
		.where(and(eq(binderPockets.listId, listId), or(at(from), at(to))));

	const moving = rows.find((row) => row.page === from.page && row.pocket === from.pocket);
	// Nothing to move. Not an error: a stale drag from a pocket someone else already emptied.
	if (!moving) return;

	const displaced = rows.find((row) => row.page === to.page && row.pocket === to.pocket);

	const values = [{ ...to, printingId: moving.printingId }];
	if (displaced) values.push({ ...from, printingId: displaced.printingId });

	await db.batch([
		db.delete(binderPockets).where(and(eq(binderPockets.listId, listId), or(at(from), at(to)))),
		db.insert(binderPockets).values(values.map((value) => ({ listId, ...value })))
	]);
}

/**
 * Removes a Page and closes the gap, so page numbers stay contiguous — otherwise deleting page 1
 * of three would leave pages 0 and 2, and every reader would have to cope with a hole.
 *
 * Two statements in a batch: the delete, then a decrement of everything after it. D1 wraps a
 * batch in a transaction, which matters because the intermediate state has two pages numbered the
 * same.
 */
export async function removePage(db: Db, listId: string, page: number): Promise<void> {
	await db.batch([
		db
			.delete(binderPockets)
			.where(and(eq(binderPockets.listId, listId), eq(binderPockets.page, page))),
		db
			.update(binderPockets)
			.set({ page: sql`${binderPockets.page} - 1` })
			.where(and(eq(binderPockets.listId, listId), sql`${binderPockets.page} > ${page}`))
	]);
}
