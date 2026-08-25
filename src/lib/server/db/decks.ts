/**
 * Deck data access — the only place route code touches the `decks`/`deck_versions` tables
 * directly. See `docs/spec/deckbuilder.md` §3.2: a deck's current state is its latest
 * `deck_versions` row; every save is a new row, never an update.
 */
import { and, asc, count, desc, eq, gte } from 'drizzle-orm';
import type { DeckVersionPayload } from '#lib/decks/schema.js';
import type { getDb } from './index.js';
import { deckLikes, decks, deckVersions, user } from './schema.js';

/** Genre convention (`docs/spec/deckbuilder.md` §9): "Hot" is a rolling window, not all-time. */
const HOT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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

/** Every version, oldest first — the deck view page's Change History diffs each one against the
 * version before it. No pagination: real decks don't accumulate enough saves for it to matter
 * yet, and it's a one-line change here if that stops being true. */
export async function listVersions(db: Db, deckId: string) {
	return db
		.select()
		.from(deckVersions)
		.where(eq(deckVersions.deckId, deckId))
		.orderBy(asc(deckVersions.savedAt));
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

/** The Explore tab's own data (§9) — every public deck (optionally filtered to one owner),
 * each with its latest version, its all-time and rolling-14-day like counts, and whether
 * `viewerId` has already liked it. Sorting by those counts happens in the caller — this just
 * gathers what a row needs. */
export async function listPublicDecks(
	db: Db,
	options: { ownerId?: string; viewerId: string | null }
) {
	const conditions = [eq(decks.visibility, 'public')];
	if (options.ownerId) conditions.push(eq(decks.ownerId, options.ownerId));

	const publicDecks = await db
		.select({ deck: decks, ownerName: user.name })
		.from(decks)
		.innerJoin(user, eq(user.id, decks.ownerId))
		.where(and(...conditions));

	const hotSince = new Date(Date.now() - HOT_WINDOW_MS);

	return Promise.all(
		publicDecks.map(async ({ deck, ownerName }) => {
			const [version, [{ likeCount }], [{ hotCount }], viewerLike] = await Promise.all([
				getLatestVersion(db, deck.id),
				db.select({ likeCount: count() }).from(deckLikes).where(eq(deckLikes.deckId, deck.id)),
				db
					.select({ hotCount: count() })
					.from(deckLikes)
					.where(and(eq(deckLikes.deckId, deck.id), gte(deckLikes.likedAt, hotSince))),
				options.viewerId
					? db
							.select()
							.from(deckLikes)
							.where(and(eq(deckLikes.deckId, deck.id), eq(deckLikes.userId, options.viewerId)))
							.limit(1)
					: []
			]);

			return {
				deck,
				ownerName,
				version,
				likeCount,
				hotCount,
				viewerHasLiked: viewerLike.length > 0
			};
		})
	);
}

export async function likeDeck(db: Db, deckId: string, userId: string) {
	await db.insert(deckLikes).values({ deckId, userId }).onConflictDoNothing();
}

export async function unlikeDeck(db: Db, deckId: string, userId: string) {
	await db.delete(deckLikes).where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, userId)));
}

/** A single deck's like count and whether `viewerId` has already liked it — the deck view
 * screen's own like toggle (§9), not the Explore list's (which is read-only: liking only
 * happens from a deck's own page, and only for non-owners). */
export async function getDeckLikeInfo(db: Db, deckId: string, viewerId: string | null) {
	const [{ likeCount }] = await db
		.select({ likeCount: count() })
		.from(deckLikes)
		.where(eq(deckLikes.deckId, deckId));

	const viewerHasLiked = viewerId
		? (
				await db
					.select()
					.from(deckLikes)
					.where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, viewerId)))
					.limit(1)
			).length > 0
		: false;

	return { likeCount, viewerHasLiked };
}
