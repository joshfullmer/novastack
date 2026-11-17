/**
 * The meta page's numbers: what is being played and how it is doing (`docs/spec/tournaments.md` §6).
 *
 * Pure. The database does the counting, in grouped aggregates, and hands this the totals; this turns them
 * into shares, rates and a matchup matrix. Nothing here knows what a "deck" row is, only counts.
 *
 * A **Legend line** is a deck's three Legends, sorted and joined by `+` (`tournament_decks.legend_line`),
 * so its Legends are recoverable from the key and need no join.
 */

/** A group needs at least this many decks before a win rate is quoted: fewer is noise, not a rate. */
export const MIN_DECKS = 5;

/**
 * **Tiers** rank decks by how they perform, not by how many play them (that is the share column beside
 * them). A deck's *power* is its match win rate (a draw counts half), pulled toward 50% as if it had also
 * played `TIER_PRIOR` even matches, so a hot streak over a few matches cannot out-rank a long record.
 * Tiers are fixed bands of power, not a curve, so a thin meta honestly has empty tiers; a group of fewer
 * than `MIN_DECKS` decks has no power and no tier.
 */
export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_PRIOR = 10;
/** The least power each tier takes; D is everything below C. */
export const TIER_FLOORS: Record<Exclude<Tier, 'D'>, number> = {
	S: 0.57,
	A: 0.53,
	B: 0.48,
	C: 0.44
};

/** Win rate shrunk toward 50% by `TIER_PRIOR` matches; null when nothing was played. */
export const power = (winRate: number | null, matches: number): number | null =>
	winRate === null ? null : (winRate * matches + 0.5 * TIER_PRIOR) / (matches + TIER_PRIOR);

/** A group's tier, or null when it has too few decks (or no matches) to be ranked. */
export function tierOf(decks: number, winRate: number | null, matches: number): Tier | null {
	const p = decks < MIN_DECKS ? null : power(winRate, matches);
	if (p === null) return null;
	if (p >= TIER_FLOORS.S) return 'S';
	if (p >= TIER_FLOORS.A) return 'A';
	if (p >= TIER_FLOORS.B) return 'B';
	return p >= TIER_FLOORS.C ? 'C' : 'D';
}

/**
 * How many Legend lines a response lists. A line is three Legends of dozens, so the count of distinct
 * lines grows with the field and mostly in one-deck lines (half of them at 1,000 events); the page gets
 * the most-played hundred and a count of the rest, never the tail itself.
 */
export const LINE_LIMIT = 100;

/** How many Legend lines the matchup matrix is drawn for. */
export const MATRIX_SIZE = 8;

export type LineRow = {
	line: string | null;
	decks: number;
	matchWins: number;
	matchLosses: number;
	matchDraws: number;
	/** Decks that finished in the top eight. */
	top8: number;
	/** Decks that won their event. */
	wins: number;
	/** The best finish any of its decks had (1 is a win). */
	best: number;
};
export type MatchupRow = { a: string | null; b: string | null; matches: number; score: number };

export type GroupStat = {
	key: string;
	/** The Legend slugs in the group: three for a line, one for a single Legend. */
	legends: string[];
	decks: number;
	/** Of the decks with a readable set of Legends. */
	share: number;
	/** Match win rate with a draw as half; null when nothing was played. */
	winRate: number | null;
	matches: number;
	top8: number;
	wins: number;
	/** Win rate pulled toward 50% for small samples (`TIER_PRIOR`); null below `MIN_DECKS` decks. */
	power: number | null;
	/** From `power`; null when the group has too few decks to rank. */
	tier: Tier | null;
};

export type MatrixCell = { a: string; b: string; matches: number; winRate: number | null };

export type MetaView = {
	/** Decks whose Legends could be read; the denominator of every share. */
	decks: number;
	/** The `LINE_LIMIT` most-played lines. */
	byLine: GroupStat[];
	/** The lines left out of `byLine`, so the page can say so rather than pass the list off as whole. */
	unlisted: { lines: number; decks: number; top8: number; wins: number };
	byLegend: GroupStat[];
	/** Every RAM in play (`tournament_decks.ram`, so `legends` is empty), most-played first. */
	byRam: GroupStat[];
	/** What the matrix is drawn over: Legend lines, or RAMs. */
	matrixBy: 'line' | 'ram';
	/** The matrix's rows and columns: the most-played groups, in order. */
	matrixLines: string[];
	/** Every ordered pair of `matrixLines`, including those nobody played (matches 0). */
	matrix: MatrixCell[];
	/** Matches counted in the matrix: between two of the `matrixLines`, each once. */
	crossMatches: number;
	/** Matches between decks of any two different lines, of which the matrix draws only `crossMatches`. */
	crossMatchesTotal: number;
};

const toStat = (row: LineRow, key: string, legends: string[], total: number): GroupStat => {
	const played = row.matchWins + row.matchLosses + row.matchDraws;
	const winRate = played ? (row.matchWins + row.matchDraws / 2) / played : null;
	return {
		key,
		legends,
		decks: row.decks,
		share: total ? row.decks / total : 0,
		winRate,
		matches: played,
		top8: row.top8,
		wins: row.wins,
		power: row.decks < MIN_DECKS ? null : power(winRate, played),
		tier: tierOf(row.decks, winRate, played)
	};
};

/** Most played first; a tie goes to the one that won more, then to the name, so the order is stable. */
const ranked = (a: GroupStat, b: GroupStat) =>
	b.decks - a.decks || b.wins - a.wins || a.key.localeCompare(b.key);

/** Every Legend line, most-played first. Shares are of all lines, whatever a caller then lists. */
function allLines(rows: readonly LineRow[]): GroupStat[] {
	const total = rows.reduce((n, row) => n + row.decks, 0);
	return rows
		.flatMap((row) => (row.line ? [toStat(row, row.line, row.line.split('+'), total)] : []))
		.sort(ranked);
}

/** The `LINE_LIMIT` most-played Legend lines: what a sidebar or a filter needs. */
export function buildLines(rows: readonly LineRow[]): GroupStat[] {
	return allLines(rows).slice(0, LINE_LIMIT);
}

export function buildMeta(input: {
	lines: readonly LineRow[];
	/** One row per RAM (the `line` field holds it), counted the same way. */
	rams: readonly LineRow[];
	/** One row per Legend slug (the `line` field holds the slug), counted the same way. */
	legends: readonly LineRow[];
	matchups: readonly MatchupRow[];
	/** What `matchups` is over; the matrix's rows and columns are its most-played groups. */
	matrixBy?: 'line' | 'ram';
	/** All matches between decks of different groups; defaults to the matrix's own count. */
	crossMatchesTotal?: number;
}): MetaView {
	const total = input.lines.reduce((n, row) => n + row.decks, 0);

	const everyLine = allLines(input.lines);
	const byLine = everyLine.slice(0, LINE_LIMIT);
	const unlisted = everyLine.slice(LINE_LIMIT);
	const byLegend = input.legends
		.flatMap((row) => (row.line ? [toStat(row, row.line, [row.line], total)] : []))
		.sort(ranked);

	const ramTotal = input.rams.reduce((n, row) => n + row.decks, 0);
	const byRam = input.rams
		.flatMap((row) => (row.line ? [toStat(row, row.line, [], ramTotal)] : []))
		.sort(ranked)
		.slice(0, LINE_LIMIT);

	const matrixBy = input.matrixBy ?? 'line';
	const matrixLines = (matrixBy === 'ram' ? byRam : byLine).slice(0, MATRIX_SIZE).map((g) => g.key);

	// Each stored row is one direction (a's Legends played b's); the matrix wants both, so credit
	// the other side with what is left of each match.
	const cells = new Map<string, { n: number; won: number }>();
	const add = (a: string, b: string, n: number, won: number) => {
		const cell = cells.get(`${a}|${b}`) ?? { n: 0, won: 0 };
		cell.n += n;
		cell.won += won;
		cells.set(`${a}|${b}`, cell);
	};
	let crossMatches = 0;
	for (const row of input.matchups) {
		if (!row.a || !row.b) continue;
		add(row.a, row.b, row.matches, row.score);
		add(row.b, row.a, row.matches, row.matches - row.score);
		crossMatches += row.matches;
	}

	const matrix: MatrixCell[] = matrixLines.flatMap((a) =>
		matrixLines.map((b) => {
			const cell = cells.get(`${a}|${b}`);
			return { a, b, matches: cell?.n ?? 0, winRate: cell?.n ? cell.won / cell.n : null };
		})
	);

	return {
		decks: total,
		byLine,
		unlisted: {
			lines: unlisted.length,
			decks: unlisted.reduce((n, g) => n + g.decks, 0),
			top8: unlisted.reduce((n, g) => n + g.top8, 0),
			wins: unlisted.reduce((n, g) => n + g.wins, 0)
		},
		byLegend,
		byRam,
		matrixBy,
		matrixLines,
		matrix,
		crossMatches,
		crossMatchesTotal: input.crossMatchesTotal ?? crossMatches
	};
}
