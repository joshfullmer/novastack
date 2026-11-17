import { getEventList } from '#lib/server/db/tournaments.js';
import { parseEventQuery } from '#lib/tournaments/event-list.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — the list is whatever has been ingested so far.
export const prerender = false;

export const load: PageServerLoad = async ({ locals, url }) => {
	return getEventList(locals.db, parseEventQuery(url.searchParams));
};
