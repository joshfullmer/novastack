import { getDailyRows } from '#lib/server/db/tournament-stats.js';
import { choose } from '#lib/tournaments/url.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	// Decks are talked about by their RAM, so that is the grouping unless asked otherwise.
	const by = choose(url.searchParams.get('by'), ['ram', 'line'], 'ram');
	return {
		// The server's clock decides which weeks are over, so a page and a reload agree.
		now: Date.now(),
		by,
		metric: choose(url.searchParams.get('show'), ['share', 'winrate'], 'share'),
		rows: await locals.cached('getDailyRows', [period, by], () =>
			getDailyRows(locals.db, period, by)
		)
	};
};
