/**
 * Bookmarking a Card in a Deck (`docs/spec/deckbuilder.md` §10.2) — its own write path, **not**
 * part of the editor's Save.
 *
 * A Bookmark is the author's "maybe", made while browsing, so it persists the moment it is made: a
 * refresh before Save must not cost a session of them. It is also why Save never carries them — a
 * stale payload from one tab would otherwise overwrite a toggle made in another.
 *
 * **Absolute, not a toggle.** The request says what the Card should be, so a retry after a dropped
 * response lands in the same place instead of flipping it back (the Collection's rule, for the same
 * reason).
 */
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { dataset } from '#lib/cards/index.js';
import { getDeck, setDeckBookmark } from '#lib/server/db/decks.js';
import type { RequestHandler } from './$types';

export const prerender = false;

const BodySchema = v.object({
	cardSlug: v.pipe(v.string(), v.nonEmpty()),
	bookmarked: v.boolean()
});

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Sign in to bookmark cards');

	const deck = await getDeck(event.locals.db, event.params.id);
	if (!deck) return error(404, 'Deck not found');
	if (deck.ownerId !== event.locals.user.id) return error(403, 'Not your deck');

	let body;
	try {
		body = v.parse(BodySchema, await event.request.json());
	} catch {
		return error(400, 'Malformed bookmark');
	}
	if (!dataset.bySlug.has(body.cardSlug)) return error(400, 'Unknown card');

	await setDeckBookmark(event.locals.db, deck.id, body.cardSlug, body.bookmarked);
	return new Response(null, { status: 204 });
};
