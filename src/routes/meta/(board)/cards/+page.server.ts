import { getCardStats, getLines, ramRows } from '#lib/server/db/tournament-stats.js';
import { RAM_PER_LEGEND } from '#lib/tournaments/present.js';
import { parseRam } from '#lib/tournaments/ram.js';
import type { PageServerLoad } from './$types';

/** A Legend line's key: three card slugs joined by `+`. Anything else is not a line. */
const LINE = /^[a-z0-9-]{1,80}(\+[a-z0-9-]{1,80}){2}$/;

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	const asked = url.searchParams.get('line');
	const line = asked !== null && LINE.test(asked) ? asked : null;
	const ram = parseRam(url.searchParams.get('ram'), RAM_PER_LEGEND);

	const [lines, rams, stats] = await Promise.all([
		locals.cached('getLines', period, () => getLines(locals.db, period)),
		locals.cached('ramRows', period, () => ramRows(locals.db, period)),
		locals.cached('getCardStats', [period, line, ram], () =>
			getCardStats(locals.db, period, { line, ram })
		)
	]);
	return {
		lines: lines.slice(0, 8),
		rams: rams
			.flatMap((row) => (row.line ? [{ ram: row.line, decks: row.decks }] : []))
			.sort((a, b) => b.decks - a.decks || a.ram.localeCompare(b.ram))
			.slice(0, 8),
		line,
		ram,
		decks: stats.decks,
		cards: stats.cards
	};
};
