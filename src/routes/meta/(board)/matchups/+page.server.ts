import { getMeta } from '#lib/server/db/tournament-stats.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	// Decks are talked about by what their Legends provide, so that is the matrix unless asked otherwise.
	const by = url.searchParams.get('by') === 'line' ? 'line' : 'ram';
	return {
		by,
		meta: await getMeta(locals.db, period, { legends: false, rams: by === 'ram', matchups: by })
	};
};
