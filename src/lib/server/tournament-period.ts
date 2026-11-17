/**
 * The period a request asks for (`?period=<meta id>`), resolved against the `metas` table. Shared by the
 * statistics layout and by any layout nested where its data can't be reached through `parent()`.
 */
import { getEventKinds, getMetas } from './db/tournament-stats.js';
import type { Db } from './db/tournaments.js';
import { parseNarrowing, periodChoices, resolvePeriod } from '#lib/tournaments/period.js';

export async function periodFor(db: Db, url: URL) {
	const [metas, kinds] = await Promise.all([getMetas(db), getEventKinds(db)]);
	return {
		kinds,
		periods: periodChoices(metas),
		period: resolvePeriod(metas, url.searchParams.get('period'), parseNarrowing(url.searchParams))
	};
}
