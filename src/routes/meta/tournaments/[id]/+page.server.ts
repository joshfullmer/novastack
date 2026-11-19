import { getDeckDetail } from '#lib/server/db/tournament-decks.js';
import { DECK_VIEWS } from '#lib/decks/view.js';
import { readViewPref } from '#lib/server/view-pref.js';
import { DECK_GUID } from '#lib/tournaments/deck-views.js';
import type { PageServerLoad } from './$types';

/**
 * The standings, with the deck asked for (`?deck=`) ready to open beside them. Only a deck of this event
 * opens here: any other guid is somebody else's page, and a link to it would put a stranger's list under
 * this event's header.
 */
export const load: PageServerLoad = async ({ locals, parent, url, cookies }) => {
	const { event } = await parent();
	const asked = url.searchParams.get('deck');
	const found =
		asked !== null && DECK_GUID.test(asked) ? await getDeckDetail(locals.db, asked) : null;
	return {
		deck: found && found.eventId === event.id ? found : null,
		// Fits the screen on a wide one: the standings and the deck each scroll, the window does not.
		fullHeight: true,
		deckView: readViewPref(cookies, 'deck-cards-view', DECK_VIEWS, 'gallery')
	};
};
