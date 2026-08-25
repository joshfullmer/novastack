import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { likeDeck, listPublicDecks, unlikeDeck } from '#lib/server/db/decks.js';
import type { Actions, PageServerLoad } from './$types';

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
		.map(({ deck, ownerName, version, likeCount, hotCount, viewerHasLiked }) => ({
			id: deck.id,
			name: deck.name,
			ownerId: deck.ownerId,
			ownerName,
			createdAt: deck.createdAt,
			cardCount: version?.entries.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			legendSlugs: version?.legends ?? [],
			likeCount,
			hotCount,
			viewerHasLiked
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
		user: event.locals.user
	};
};

export const actions: Actions = {
	toggleLike: async (event) => {
		if (!event.locals.user) return redirect(302, '/auth/login');

		const formData = await event.request.formData();
		const deckId = formData.get('deckId');
		if (typeof deckId !== 'string') return fail(400, { message: 'Missing deckId' });

		if (formData.get('liked') === 'true') {
			await unlikeDeck(event.locals.db, deckId, event.locals.user.id);
		} else {
			await likeDeck(event.locals.db, deckId, event.locals.user.id);
		}
	}
};
