import { getMeta } from '#lib/server/db/tournament-stats.js';
import { choose } from '#lib/tournaments/url.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	// Decks are talked about by what their Legends provide, so that is the matrix unless asked otherwise.
	const by = choose(url.searchParams.get('by'), ['ram', 'line'], 'ram');
	// Which rounds count: all of them, the Swiss rounds, or only the playoff (the top cut).
	const phase = choose(url.searchParams.get('rounds'), ['all', 'swiss', 'cut'], 'all');
	const scope = { legends: false, rams: by === 'ram', matchups: by, phase } as const;
	return {
		by,
		phase,
		meta: await locals.cached('getMeta', [period, scope], () => getMeta(locals.db, period, scope))
	};
};
