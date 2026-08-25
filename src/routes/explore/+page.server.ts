import * as v from 'valibot';
import { listPublicDecks } from '#lib/server/db/decks.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this reads request-scoped session/DB state.
export const prerender = false;

const SortSchema = v.picklist(['hot', 'newest', 'most-liked']);
type Sort = v.InferOutput<typeof SortSchema>;

/**
 * The public deck explorer — `docs/spec/deckbuilder.md` §9. Its own top-level route (`/explore`),
 * not a tab sharing `/decks` with the owner-only "My Decks" list: every reference site we looked
 * at (swudb, Piltover Archive, Moxfield) treats the public browse surface as the primary,
 * nav-reachable destination and tucks the signed-in-only list elsewhere, never as a peer tab on
 * the same page.
 */
export const load: PageServerLoad = async (event) => {
	const sortParam = event.url.searchParams.get('sort');
	const sort: Sort = v.is(SortSchema, sortParam) ? sortParam : 'newest';
	const ownerId = event.url.searchParams.get('owner') ?? undefined;

	const rows = await listPublicDecks(event.locals.db, {
		ownerId,
		viewerId: event.locals.user?.id ?? null
	});

	const decks = rows
		.map(({ deck, ownerName, version, likeCount, hotCount }) => ({
			id: deck.id,
			name: deck.name,
			ownerId: deck.ownerId,
			ownerName,
			createdAt: deck.createdAt,
			cardCount: version?.entries.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			legendSlugs: version?.legends ?? [],
			likeCount,
			hotCount
		}))
		.sort((a, b) => {
			if (sort === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
			if (sort === 'most-liked') return b.likeCount - a.likeCount;
			return b.hotCount - a.hotCount;
		});

	return {
		decks,
		sort,
		ownerId: ownerId ?? null,
		ownerName: ownerId ? (decks[0]?.ownerName ?? null) : null,
		// Not read by this page's own template — Nav still needs it for the Sign in/out swap,
		// since this route has no dedicated `+layout.server.ts` supplying it (`/decks` does).
		user: event.locals.user
	};
};
