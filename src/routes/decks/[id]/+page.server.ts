import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { DeckVersionPayloadSchema } from '#lib/decks/schema.js';
import { getDeck, getLatestVersion } from '#lib/server/db/decks.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — a specific deck's visibility/content is
// request-scoped and can't be known at build time.
export const prerender = false;

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

	return {
		deckId: deck.id,
		deckName: deck.name,
		ownerName: deck.ownerName,
		visibility: deck.visibility,
		isOwner,
		payload
	};
};
