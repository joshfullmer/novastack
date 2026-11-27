/**
 * The meta over time: each deck's share of the field and its win rate, per day or per week
 * (`docs/spec/tournaments.md` §6, "Trends").
 *
 * Pure: the database counts decks and results per day and group, this buckets them and works out the
 * rates. Events cluster on weekends, so a week is the unit: a day is mostly the Saturday and Sunday of the same events, and the gap between them
 * is the day of the week, not a trend. A week is drawn only
 * with `MIN_FIELD` decks behind it (a share of a handful is noise). One still running is drawn too but
 * flagged `partial`: a week before its weekend holds few events, so its shares can read as a collapse, and
 * the chart shows it as provisional rather than leaving out the newest data.
 */

/** One day's decks and results for one group (a RAM or a Legend line); `day` is `YYYY-MM-DD`, UTC. */
export type DayRow = {
	day: string;
	key: string;
	decks: number;
	wins: number;
	losses: number;
	draws: number;
};

export type Point = {
	/** The bucket's start, in milliseconds (UTC; a week starts on Monday). */
	t: number;
	/** The bucket has not finished, so these numbers may still move. */
	partial: boolean;
	decks: number;
	/** Of every keyed deck in the bucket, not just the series drawn. */
	share: number;
	/** Null under `MIN_MATCHES` matches in the bucket: a rate over a handful is noise, so it is left out. */
	winRate: number | null;
	matches: number;
};
export type Series = { key: string; points: Point[] };
export type Trend = {
	/** The bucket starts that are drawn, oldest first. */
	times: number[];
	/** The most-played groups overall, most first. */
	series: Series[];
};

/** A bucket needs this many keyed decks before its shares mean anything. */
export const MIN_FIELD = 20;
/** A bucket needs this many matches before a win rate is quoted. */
export const MIN_MATCHES = 30;
/** How many groups are drawn: more lines than this cannot be told apart. */
export const TOP = 6;

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** The Monday (UTC) of the week a day falls in. */
export function weekStart(day: string): number {
	const t = Date.parse(`${day}T00:00:00Z`);
	return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
}

/** Whether a week has finished by `now`, so its numbers will not change by being waited for. */
export const isOver = (t: number, now: number): boolean => t + WEEK <= now;

type Tally = { decks: number; score: number; matches: number };

export function buildTrend(rows: readonly DayRow[], now: number, top = TOP): Trend {
	const cells = new Map<number, Map<string, Tally>>();
	const totals = new Map<string, number>();
	for (const row of rows) {
		const t = weekStart(row.day);
		const at = cells.get(t) ?? new Map<string, Tally>();
		const cell = at.get(row.key) ?? { decks: 0, score: 0, matches: 0 };
		cell.decks += row.decks;
		cell.score += row.wins + row.draws / 2;
		cell.matches += row.wins + row.losses + row.draws;
		at.set(row.key, cell);
		cells.set(t, at);
	}
	const field = (t: number) => [...(cells.get(t)?.values() ?? [])].reduce((n, c) => n + c.decks, 0);
	const times = [...cells.keys()].filter((t) => field(t) >= MIN_FIELD).sort((a, b) => a - b);
	// Ranked over the buckets that are drawn, so a group's place is by what the chart shows.
	for (const t of times)
		for (const [key, cell] of cells.get(t) ?? [])
			totals.set(key, (totals.get(key) ?? 0) + cell.decks);
	const keys = [...totals]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, top)
		.map(([key]) => key);

	const series = keys.map((key) => ({
		key,
		points: times.map((t): Point => {
			const cell = cells.get(t)?.get(key);
			return {
				t,
				partial: !isOver(t, now),
				decks: cell?.decks ?? 0,
				share: (cell?.decks ?? 0) / field(t),
				winRate: cell && cell.matches >= MIN_MATCHES ? cell.score / cell.matches : null,
				matches: cell?.matches ?? 0
			};
		})
	}));
	return { times, series };
}
