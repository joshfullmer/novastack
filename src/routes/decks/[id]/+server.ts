/**
 * The old deck-view URL, kept alive as a permanent redirect to the canonical short one
 * (`/d/[code]`).
 *
 * Every deck link shared before share codes existed points here, and those links live in Discord
 * messages and bookmarks nobody is going to edit. Honouring them is this route's whole job.
 *
 * An **endpoint rather than a page**: there is no UI here, only a `Location` header, and a
 * `+page.server.ts` would need a `+page.svelte` beside it that could never render. The child route
 * `/decks/[id]/edit` is unaffected and still takes a UUID.
 *
 * `301`, not `302`: the move is permanent, so browsers and crawlers can stop asking. The redirect
 * is therefore cached hard, which is safe — a deck's code never changes once assigned, and the only
 * way this mapping goes stale is deletion, where the destination 404s anyway.
 */
import { error, redirect } from '@sveltejs/kit';
import { getDeckByRef } from '#lib/server/db/decks.js';
import { ensureDeckShareCode } from '#lib/server/db/share-codes.js';
import type { RequestHandler } from './$types';

// Overrides the root layout's `prerender = true` — which deck this is, and whether it still
// exists, is request-scoped.
export const prerender = false;

export const GET: RequestHandler = async (event) => {
	// Accepts a share code as well as a UUID, so an internal link that never got updated still
	// lands somewhere sensible instead of 404ing.
	const deck = await getDeckByRef(event.locals.db, event.params.id);
	// A 404 rather than a bounce to `/decks`: a dead link should say it's dead, not quietly drop
	// someone onto a list of their own decks wondering what they were sent.
	if (!deck) return error(404, 'Deck not found');

	// Visibility is deliberately *not* checked here. This reveals only that some deck exists at a
	// UUID the requester already held, and the destination applies the real rule — a private deck
	// still 403s one hop later, with nothing extra leaked by the hop.
	return redirect(301, `/d/${await ensureDeckShareCode(event.locals.db, deck)}`);
};
