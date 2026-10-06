import { redirect } from '@sveltejs/kit';
import { createDeck } from '#lib/server/db/decks.js';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');
	const deck = await createDeck(event.locals.db, event.locals.user.id, 'New deck');
	// `?import` is "New deck → Import list": the same empty deck, with the editor's import dialog
	// already open, since pasting a list is the only reason to have asked for that.
	const suffix = event.url.searchParams.has('import') ? '?import' : '';
	return redirect(303, `/decks/${deck.id}/edit${suffix}`);
};
