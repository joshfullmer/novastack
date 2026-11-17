import { getCardStats, getLines } from '#lib/server/db/tournament-stats.js';
import type { PageServerLoad } from './$types';

/** A Legend line's key: three card slugs joined by `+`. Anything else is not a line. */
const LINE = /^[a-z0-9-]{1,80}(\+[a-z0-9-]{1,80}){2}$/;

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	const asked = url.searchParams.get('line');
	const line = asked !== null && LINE.test(asked) ? asked : null;

	const [lines, stats] = await Promise.all([
		getLines(locals.db, period),
		getCardStats(locals.db, period, line)
	]);
	return { lines: lines.slice(0, 8), line, decks: stats.decks, cards: stats.cards };
};
