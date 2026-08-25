import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	deleteDeck,
	duplicateDeck,
	getDeck,
	listDecksForOwner,
	renameDeck,
	setDeckVisibility
} from '#lib/server/db/decks.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this reads request-scoped session/DB state.
export const prerender = false;

const VisibilitySchema = v.picklist(['public', 'unlisted', 'private']);

/** Every row action targets a deck by id from form data — verified owned here so a crafted
 * request can't rename/delete/duplicate someone else's deck. */
async function requireOwnedDeck(event: {
	locals: App.Locals;
	request: Request;
}): Promise<{ deckId: string; userId: string; formData: FormData }> {
	if (!event.locals.user) return redirect(302, '/auth/login');
	const userId = event.locals.user.id;

	const formData = await event.request.formData();
	const deckId = formData.get('deckId');
	if (typeof deckId !== 'string') return error(400, 'Missing deckId');

	const deck = await getDeck(event.locals.db, deckId);
	if (!deck) return error(404, 'Deck not found');
	if (deck.ownerId !== userId) return error(403, 'Not your deck');

	return { deckId, userId, formData };
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');

	const owned = await listDecksForOwner(event.locals.db, event.locals.user.id);

	return {
		decks: owned.map(({ deck, version }) => ({
			id: deck.id,
			name: deck.name,
			visibility: deck.visibility,
			cardCount: version?.entries.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			legendSlugs: version?.legends ?? [],
			savedAt: version?.savedAt ?? null
		}))
	};
};

export const actions: Actions = {
	rename: async (event) => {
		const { deckId, formData } = await requireOwnedDeck(event);
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Deck name cannot be empty' });
		}
		await renameDeck(event.locals.db, deckId, name.trim());
	},

	visibility: async (event) => {
		const { deckId, formData } = await requireOwnedDeck(event);
		let visibility;
		try {
			visibility = v.parse(VisibilitySchema, formData.get('visibility'));
		} catch {
			return fail(400, { message: 'Invalid visibility' });
		}
		await setDeckVisibility(event.locals.db, deckId, visibility);
	},

	duplicate: async (event) => {
		const { deckId, userId } = await requireOwnedDeck(event);
		await duplicateDeck(event.locals.db, deckId, userId);
	},

	delete: async (event) => {
		const { deckId } = await requireOwnedDeck(event);
		await deleteDeck(event.locals.db, deckId);
	}
};
