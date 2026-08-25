import { redirect } from '@sveltejs/kit';
import { createDeck } from '#lib/server/db/decks.js';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');
	const deck = await createDeck(event.locals.db, event.locals.user.id, 'New deck');
	return redirect(303, `/decks/${deck.id}/edit`);
};
