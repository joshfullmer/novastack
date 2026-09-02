import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { DeckVersionPayloadSchema } from '#lib/decks/schema.js';
import { diffVersions } from '#lib/decks/version-diff.js';
import {
	deleteDeck,
	duplicateDeck,
	getDeck,
	getDeckLikeInfo,
	getLatestVersion,
	likeDeck,
	listVersions,
	renameDeck,
	setDeckVisibility,
	unlikeDeck
} from '#lib/server/db/decks.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — a specific deck's visibility/content is
// request-scoped and can't be known at build time.
export const prerender = false;

const VisibilitySchema = v.picklist(['public', 'unlisted', 'private']);

/** Row-operation actions (§8) also reachable from this deck's own view, not just the `/decks`
 * list — owner-only regardless of the deck's own visibility. */
async function requireOwner(event: {
	locals: App.Locals;
	params: { id: string };
}): Promise<{ deckId: string; userId: string }> {
	if (!event.locals.user) return redirect(302, '/auth/login');
	const userId = event.locals.user.id;

	const deck = await getDeck(event.locals.db, event.params.id);
	if (!deck) return error(404, 'Deck not found');
	if (deck.ownerId !== userId) return error(403, 'Not your deck');

	return { deckId: event.params.id, userId };
}

/**
 * The read-only view — `docs/spec/deckbuilder.md` §7: "owner sees an editor, others a viewer,
 * gated by visibility." Anyone may load a public/unlisted deck's view, signed in or not; a
 * private deck is owner-only. The editor at `/decks/[id]/edit` is the separate, stricter,
 * always-owner-only route.
 */
export const load: PageServerLoad = async (event) => {
	const deck = await getDeck(event.locals.db, event.params.id);
	if (!deck) return error(404, 'Deck not found');

	const isOwner = event.locals.user?.id === deck.ownerId;
	if (deck.visibility === 'private' && !isOwner) return error(403, 'This deck is private');

	const version = await getLatestVersion(event.locals.db, deck.id);
	const payload = v.parse(DeckVersionPayloadSchema, {
		entries: version?.entries ?? [],
		legends: version?.legends ?? []
	});

	// Liking is a non-owner action (§9) — the toggle only ever renders for someone else's deck,
	// but the count itself is shown regardless of who's looking.
	const { likeCount, viewerHasLiked } = await getDeckLikeInfo(
		event.locals.db,
		deck.id,
		event.locals.user?.id ?? null
	);

	// Change History (deck view page) — every version, each diffed against the one before it.
	const versionRows = await listVersions(event.locals.db, deck.id);
	const parsedVersions = versionRows.map((row) =>
		v.parse(DeckVersionPayloadSchema, { entries: row.entries, legends: row.legends })
	);
	const history = parsedVersions.map((version, index) => ({
		savedAt: versionRows[index].savedAt.toISOString(),
		entries: version.entries,
		legends: version.legends,
		diff: diffVersions(index === 0 ? null : parsedVersions[index - 1], version)
	}));

	return {
		deckId: deck.id,
		deckName: deck.name,
		ownerName: deck.ownerName,
		visibility: deck.visibility,
		isOwner,
		payload,
		likeCount,
		viewerHasLiked,
		history,
		// Shared with the editor (`/decks/[id]/edit`) — "how I like browsing a deck's cards" is
		// one preference, not two.
		deckView: readViewPref(event.cookies, 'deck-cards-view', ['list', 'gallery'], 'list')
	};
};

export const actions: Actions = {
	rename: async (event) => {
		const { deckId } = await requireOwner(event);
		const formData = await event.request.formData();
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Deck name cannot be empty' });
		}
		await renameDeck(event.locals.db, deckId, name.trim());
	},

	visibility: async (event) => {
		const { deckId } = await requireOwner(event);
		const formData = await event.request.formData();
		let visibility;
		try {
			visibility = v.parse(VisibilitySchema, formData.get('visibility'));
		} catch {
			return fail(400, { message: 'Invalid visibility' });
		}
		await setDeckVisibility(event.locals.db, deckId, visibility);
	},

	duplicate: async (event) => {
		const { deckId, userId } = await requireOwner(event);
		const copy = await duplicateDeck(event.locals.db, deckId, userId);
		if (!copy) return error(404, 'Deck not found');
		return redirect(303, `/decks/${copy.id}`);
	},

	/**
	 * `duplicate`'s non-owner counterpart — a public/unlisted deck is a legitimate starting point
	 * for someone else's build, and re-entering every card by hand to use it as one is exactly
	 * the busywork this exists to skip. Same `duplicateDeck` as owner-duplicate — it already takes
	 * `ownerId` as its own parameter, decoupled from the original deck's owner, so the copy lands
	 * in the *viewer's* decks, private, with no history or likes carried over — a fresh deck, not
	 * a share of the original. Same login-redirect pattern as `toggleLike`: the button always
	 * renders for a non-owner, signed in or not, and the action itself sends a signed-out viewer
	 * to log in rather than hiding the affordance.
	 */
	copy: async (event) => {
		if (!event.locals.user) return redirect(302, '/auth/login');
		const deck = await getDeck(event.locals.db, event.params.id);
		if (!deck) return error(404, 'Deck not found');
		if (deck.visibility === 'private' && deck.ownerId !== event.locals.user.id) {
			return error(403, 'This deck is private');
		}
		const copy = await duplicateDeck(event.locals.db, deck.id, event.locals.user.id);
		if (!copy) return error(404, 'Deck not found');
		return redirect(303, `/decks/${copy.id}`);
	},

	delete: async (event) => {
		const { deckId } = await requireOwner(event);
		await deleteDeck(event.locals.db, deckId);
		return redirect(303, '/decks');
	},

	toggleLike: async (event) => {
		if (!event.locals.user) return redirect(302, '/auth/login');

		const deck = await getDeck(event.locals.db, event.params.id);
		if (!deck) return error(404, 'Deck not found');
		if (deck.ownerId === event.locals.user.id) return error(403, "Can't like your own deck");

		const formData = await event.request.formData();
		if (formData.get('liked') === 'true') {
			await unlikeDeck(event.locals.db, deck.id, event.locals.user.id);
		} else {
			await likeDeck(event.locals.db, deck.id, event.locals.user.id);
		}
	}
};
