import { getMeta } from '#lib/server/db/tournament-stats.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { period } = await parent();
	return { meta: await getMeta(locals.db, period, { legends: false, matchups: true }) };
};
