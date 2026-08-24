import { redirect } from '@sveltejs/kit';
import { listDecksForOwner } from '#lib/server/db/decks.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this reads request-scoped session/DB state.
export const prerender = false;

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
