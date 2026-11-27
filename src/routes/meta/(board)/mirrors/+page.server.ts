import { getMirrorGroups, getMirrors } from '#lib/server/db/tournament-stats.js';
import { isPossibleLine, RAM_PER_LEGEND } from '#lib/tournaments/present.js';
import { parseRam } from '#lib/tournaments/ram.js';
import type { PageServerLoad } from './$types';

/** A Legend line's key: three card slugs joined by `+`. Anything else is not a line. */
const LINE = /^[a-z0-9-]{1,80}(\+[a-z0-9-]{1,80}){2}$/;

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	const asked = url.searchParams.get('line');
	const askedLine = asked !== null && LINE.test(asked) && isPossibleLine(asked) ? asked : null;
	const askedRam = parseRam(url.searchParams.get('ram'), RAM_PER_LEGEND);

	const [rams, lines] = await Promise.all([
		locals.cached('getMirrorGroups', [period, 'ram'], () =>
			getMirrorGroups(locals.db, period, 'ram')
		),
		locals.cached('getMirrorGroups', [period, 'line'], () =>
			getMirrorGroups(locals.db, period, 'line')
		)
	]);

	// A mirror breaker needs a deck to be the mirror of, so a bare link means the most-mirrored RAM.
	const picked = askedLine || askedRam;
	const ram = picked ? askedRam : (rams[0]?.key ?? null);
	const line = picked ? askedLine : null;
	const scope = { line, ram };
	return {
		rams,
		lines,
		line,
		ram,
		mirrors:
			line === null && ram === null
				? null
				: await locals.cached('getMirrors', [period, scope], () =>
						getMirrors(locals.db, period, scope)
					)
	};
};
