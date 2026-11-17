import { error } from '@sveltejs/kit';
import { getDeckDetail } from '#lib/server/db/tournament-decks.js';
import type { PageServerLoad } from './$types';

// Melee's decklist ids are GUIDs.
const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!GUID.test(params.guid)) error(404, 'Deck not found');
	const deck = await getDeckDetail(locals.db, params.guid);
	if (!deck) error(404, 'Deck not found');
	return { deck };
};
