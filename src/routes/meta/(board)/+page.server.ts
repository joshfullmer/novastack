import { getMeta } from '#lib/server/db/tournament-stats.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { period } = await parent();
	// The tier list ranks lines and Legends; the matchup matrix is its own page and its own queries.
	const scope = { legends: true, rams: true, matchups: false } as const;
	return {
		meta: await locals.cached('getMeta', [period, scope], () => getMeta(locals.db, period, scope))
	};
};
