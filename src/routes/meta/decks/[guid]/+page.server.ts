import { error } from '@sveltejs/kit';
import { getDeckDetail } from '#lib/server/db/tournament-decks.js';
import { DECK_VIEWS } from '#lib/decks/view.js';
import { DECK_GUID } from '#lib/tournaments/deck-views.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, cookies }) => {
	if (!DECK_GUID.test(params.guid)) error(404, 'Deck not found');
	const deck = await locals.cached('getDeckDetail', params.guid, () =>
		getDeckDetail(locals.db, params.guid)
	);
	if (!deck) error(404, 'Deck not found');
	return {
		deck,
		deckView: readViewPref(cookies, 'deck-cards-view', DECK_VIEWS, 'gallery')
	};
};
