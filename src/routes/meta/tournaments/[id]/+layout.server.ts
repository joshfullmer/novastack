import { error } from '@sveltejs/kit';
import { getEventView } from '#lib/server/db/tournaments.js';
import type { LayoutServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — events are ingested by hand at any time, so the
// set of ids isn't known at build, and the data lives in D1.
export const prerender = false;

/**
 * One ingested Melee tournament — `docs/spec/tournaments.md`. In a layout, so the header and its
 * three views (standings, podium, rounds) share one load instead of each repeating it.
 */
export const load: LayoutServerLoad = async ({ params, locals }) => {
	// Melee ids are plain integers; anything else can't name an event, and shouldn't reach the database.
	if (!/^\d{1,12}$/.test(params.id)) error(404, 'Tournament not found');

	const event = await getEventView(locals.db, Number(params.id));
	if (!event) error(404, 'Tournament not found');
	return { event };
};
