import { redirect } from '@sveltejs/kit';
import { can } from '#lib/entitlements.js';
import { createDeck } from '#lib/server/db/decks.js';
import { featuresFor } from '#lib/server/db/entitlements.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — signed-in state and the view cookie are
// request-scoped.
export const prerender = false;

/**
 * `/decks/new` — the front door of the builder. Open to anyone: a visitor builds a local draft with
 * no account (`docs/spec/deckbuilder.md` §10.5), and signing in is asked for only at Save.
 *
 * The default action below is what the "+ New deck" button on `/decks` posts to: an empty
 * account-backed deck, straight into its editor. It is an action rather than a `+server.ts` POST
 * because a browser form POST to a route that has a page is routed to the *page* — a `+server.ts`
 * POST beside this page would never run for it.
 */
export const load: PageServerLoad = async (event) => ({
	// Signed out there is no entitlement, so no Printing picker — which is also why a draft never
	// carries a chosen Printing.
	canChoosePrinting: can(
		await featuresFor(event.locals.db, event.locals.user?.id),
		'choose-printing'
	),
	deckView: readViewPref(event.cookies, 'deck-cards-view', ['list', 'gallery'], 'gallery')
});

export const actions: Actions = {
	default: async (event) => {
		// Signed out there is nothing to create: send them to the draft builder instead.
		if (!event.locals.user) return redirect(303, '/decks/new');
		const deck = await createDeck(event.locals.db, event.locals.user.id, 'New deck');
		// `?import` is "New deck → Import list": the same empty deck, with the editor's import dialog
		// already open, since pasting a list is the only reason to have asked for that.
		const suffix = event.url.searchParams.has('import') ? '?import' : '';
		return redirect(303, `/decks/${deck.id}/edit${suffix}`);
	}
};
