/**
 * Deck data access — the only place route code touches the `decks`/`deck_versions` tables
 * directly. See `docs/spec/deckbuilder.md` §3.2: a deck's current state is its latest
 * `deck_versions` row; every save is a new row, never an update.
 */
import { desc, eq } from 'drizzle-orm';
import type { DeckVersionPayload } from '#lib/decks/schema.js';
import type { getDb } from './index.js';
import { decks, deckVersions, user } from './schema.js';

type Visibility = NonNullable<(typeof decks.$inferInsert)['visibility']>;

type Db = ReturnType<typeof getDb>;

export async function createDeck(db: Db, ownerId: string, name: string) {
	const [deck] = await db.insert(decks).values({ ownerId, name }).returning();
	await db.insert(deckVersions).values({ deckId: deck.id, entries: [], legends: [] });
	return deck;
}

/** Joined with its owner's display name — the view screen's "by {name}" attribution. */
export async function getDeck(db: Db, deckId: string) {
	const [row] = await db
		.select({ deck: decks, ownerName: user.name })
		.from(decks)
		.innerJoin(user, eq(user.id, decks.ownerId))
		.where(eq(decks.id, deckId));
	return row ? { ...row.deck, ownerName: row.ownerName } : null;
}

export async function getLatestVersion(db: Db, deckId: string) {
	const [version] = await db
		.select()
		.from(deckVersions)
		.where(eq(deckVersions.deckId, deckId))
		.orderBy(desc(deckVersions.savedAt))
		.limit(1);
	return version ?? null;
}

/** Every save is a new row — changeset-granularity version history, never an in-place update. */
export async function saveDeckVersion(db: Db, deckId: string, payload: DeckVersionPayload) {
	await db
		.insert(deckVersions)
		.values({ deckId, entries: payload.entries, legends: payload.legends });
}

export async function renameDeck(db: Db, deckId: string, name: string) {
	await db.update(decks).set({ name }).where(eq(decks.id, deckId));
}

export async function setDeckVisibility(db: Db, deckId: string, visibility: Visibility) {
	await db.update(decks).set({ visibility }).where(eq(decks.id, deckId));
}

export async function deleteDeck(db: Db, deckId: string) {
	await db.delete(decks).where(eq(decks.id, deckId));
}

/** Copies name and latest version only — never the original's visibility, so a duplicate of a
 * public deck doesn't itself start out public. */
export async function duplicateDeck(db: Db, deckId: string, ownerId: string) {
	const [original] = await db.select().from(decks).where(eq(decks.id, deckId));
	if (!original) return null;

	const version = await getLatestVersion(db, deckId);
	const [copy] = await db
		.insert(decks)
		.values({ ownerId, name: `${original.name} (copy)` })
		.returning();
	await db
		.insert(deckVersions)
		.values({ deckId: copy.id, entries: version?.entries ?? [], legends: version?.legends ?? [] });
	return copy;
}

export async function listDecksForOwner(db: Db, ownerId: string) {
	const ownedDecks = await db
		.select()
		.from(decks)
		.where(eq(decks.ownerId, ownerId))
		.orderBy(desc(decks.createdAt));

	return Promise.all(
		ownedDecks.map(async (deck) => ({ deck, version: await getLatestVersion(db, deck.id) }))
	);
}
