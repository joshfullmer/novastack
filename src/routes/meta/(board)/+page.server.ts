import { getMeta } from '#lib/server/db/tournament-stats.js';
import { choose } from '#lib/tournaments/url.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	// The tier list ranks lines and Legends; the matchup matrix is its own page and its own queries.
	const scope = { legends: true, rams: true, matchups: false } as const;
	return {
		// What is counted and how it is grouped are in the address, so a view can be linked to.
		part: choose(url.searchParams.get('count'), ['decks', 'top8', 'wins'], 'decks'),
		by: choose(url.searchParams.get('by'), ['ram', 'line', 'legend'], 'ram'),
		meta: await locals.cached('getMeta', [period, scope], () => getMeta(locals.db, period, scope))
	};
};
