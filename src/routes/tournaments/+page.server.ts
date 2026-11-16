import { getEventList } from '#lib/server/db/tournaments.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — the list is whatever has been ingested so far.
export const prerender = false;

export const load: PageServerLoad = async ({ locals }) => {
	return { events: await getEventList(locals.db) };
};
