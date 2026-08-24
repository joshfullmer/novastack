import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { DeckVersionPayloadSchema } from '#lib/decks/schema.js';
import { getDeck, getLatestVersion, saveDeckVersion } from '#lib/server/db/decks.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — a specific deck's owner/content is
// request-scoped and can't be known at build time.
export const prerender = false;

async function requireOwnedDeck(event: { locals: App.Locals; params: { id: string } }) {
	if (!event.locals.user) return redirect(302, '/auth/login');
	const deck = await getDeck(event.locals.db, event.params.id);
	if (!deck) return error(404, 'Deck not found');
	// Phase 1: the deckbuilder screen is owner-only. Visibility-gated viewing for other users
	// (docs/spec/deckbuilder.md §6, sharing/export) is explicitly Phase 2, not built yet.
	if (deck.ownerId !== event.locals.user.id) return error(403, 'Not your deck');
	return deck;
}

export const load: PageServerLoad = async (event) => {
	const deck = await requireOwnedDeck(event);

	const version = await getLatestVersion(event.locals.db, deck.id);
	const payload = v.parse(DeckVersionPayloadSchema, {
		entries: version?.entries ?? [],
		legends: version?.legends ?? []
	});

	return { deckId: deck.id, deckName: deck.name, payload };
};

export const actions: Actions = {
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

		await saveDeckVersion(event.locals.db, deck.id, payload);
		return { success: true };
	}
};
