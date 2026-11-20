import { getMeta } from '#lib/server/db/tournament-stats.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	// Decks are talked about by what their Legends provide, so that is the matrix unless asked otherwise.
	const by = url.searchParams.get('by') === 'line' ? 'line' : 'ram';
	const scope = { legends: false, rams: by === 'ram', matchups: by } as const;
	return {
		by,
		meta: await locals.cached('getMeta', [period, scope], () => getMeta(locals.db, period, scope))
	};
};
