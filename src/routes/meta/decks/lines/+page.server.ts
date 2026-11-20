import { getDecksByLine } from '#lib/server/db/tournament-decks.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { period } = await parent();
	return await locals.cached('getDecksByLine', period, () => getDecksByLine(locals.db, period));
};
