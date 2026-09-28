import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { carryForwardPrintings } from '#lib/decks/carry-printings.js';
import { deckPath } from '#lib/decks/links.js';
import { DeckVersionPayloadSchema } from '#lib/decks/schema.js';
import { can } from '#lib/entitlements.js';
import { featuresFor } from '#lib/server/db/entitlements.js';
import { getDeck, getLatestVersion, renameDeck, saveDeckVersion } from '#lib/server/db/decks.js';
import { ensureDeckShareCode } from '#lib/server/db/share-codes.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — a specific deck's owner/content is
// request-scoped and can't be known at build time.
export const prerender = false;

async function requireOwnedDeck(event: { locals: App.Locals; params: { id: string } }) {
	if (!event.locals.user) return redirect(302, '/auth/login');
	const deck = await getDeck(event.locals.db, event.params.id);
	if (!deck) return error(404, 'Deck not found');
	// The editor is owner-only regardless of visibility — a public/unlisted deck is viewable by
	// anyone at `/decks/[id]` (the read-only view), but only its owner may open this route.
	if (deck.ownerId !== event.locals.user.id) return error(403, 'Not your deck');
	return deck;
}

export const load: PageServerLoad = async (event) => {
	const deck = await requireOwnedDeck(event);

	const version = await getLatestVersion(event.locals.db, deck.id);
	const payload = v.parse(DeckVersionPayloadSchema, {
		entries: version?.entries ?? [],
		legends: version?.legends ?? [],
		sideboard: version?.sideboard ?? []
	});

	return {
		deckId: deck.id,
		/**
		 * Whether this user may choose Printings (`#lib/entitlements.ts`). The editor hides the
		 * picker outright when false — see the `save` action below, which re-derives this rather
		 * than trusting it, because page data is a rendering hint and not a permission.
		 */
		canChoosePrinting: can(
			await featuresFor(event.locals.db, event.locals.user?.id),
			'choose-printing'
		),
		/** So "Discard changes" and the post-save redirect point straight at the canonical short
		 * URL instead of bouncing through `/decks/[id]`'s 301. */
		shareCode: await ensureDeckShareCode(event.locals.db, deck),
		deckName: deck.name,
		payload,
		// Shared with the read-only view (`/decks/[id]`) — "how I like browsing a deck's cards"
		// is one preference, not two.
		deckView: readViewPref(event.cookies, 'deck-cards-view', ['list', 'gallery'], 'gallery')
	};
};

export const actions: Actions = {
	rename: async (event) => {
		const deck = await requireOwnedDeck(event);
		const formData = await event.request.formData();
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Deck name cannot be empty' });
		}
		await renameDeck(event.locals.db, deck.id, name.trim());
	},

	save: async (event) => {
		const deck = await requireOwnedDeck(event);

		const formData = await event.request.formData();
		const raw = formData.get('payload');
		if (typeof raw !== 'string') return fail(400, { message: 'Missing deck payload' });

		let payload;
		try {
			payload = v.parse(DeckVersionPayloadSchema, JSON.parse(raw));
		} catch {
			return fail(400, { message: 'Malformed deck payload' });
		}

		/**
		 * An unentitled save keeps whatever Printings the deck already had, rather than taking the
		 * client's word for it (`carryForwardPrintings` explains the reasoning at length). Two
		 * failure modes this closes: a lapsed subscriber silently losing every choice the next time
		 * they touch a quantity, and a hand-crafted POST setting printings without the grant.
		 *
		 * Re-derived here, never read from the form: what the page was *rendered* with is a hint,
		 * and this is the boundary that actually decides.
		 */
		const entitled = can(
			await featuresFor(event.locals.db, event.locals.user?.id),
			'choose-printing'
		);
		let toStore = payload;
		if (!entitled) {
			const current = await getLatestVersion(event.locals.db, deck.id);
			const stored = current
				? v.parse(DeckVersionPayloadSchema, {
						entries: current.entries,
						legends: current.legends,
						sideboard: current.sideboard
					})
				: null;
			toStore = carryForwardPrintings(stored, payload);
		}

		await saveDeckVersion(event.locals.db, deck.id, toStore);
		return redirect(303, deckPath(deck));
	}
};
