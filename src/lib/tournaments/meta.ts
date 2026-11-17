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
};

export type MatrixCell = { a: string; b: string; matches: number; winRate: number | null };

export type MetaView = {
	/** Decks whose Legends could be read; the denominator of every share. */
	decks: number;
	byLine: GroupStat[];
	byLegend: GroupStat[];
	/** The matrix's rows and columns: the most-played lines, in order. */
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
	return {
		key,
		legends,
		decks: row.decks,
		share: total ? row.decks / total : 0,
		winRate: played ? (row.matchWins + row.matchDraws / 2) / played : null,
		matches: played,
		top8: row.top8,
		wins: row.wins
	};
};

/** Most played first; a tie goes to the one that won more, then to the name, so the order is stable. */
const ranked = (a: GroupStat, b: GroupStat) =>
	b.decks - a.decks || b.wins - a.wins || a.key.localeCompare(b.key);

/** Just the Legend lines, most-played first: what a sidebar or a filter needs. */
export function buildLines(rows: readonly LineRow[]): GroupStat[] {
	const total = rows.reduce((n, row) => n + row.decks, 0);
	return rows
		.flatMap((row) => (row.line ? [toStat(row, row.line, row.line.split('+'), total)] : []))
		.sort(ranked);
}

export function buildMeta(input: {
	lines: readonly LineRow[];
	/** One row per Legend slug (the `line` field holds the slug), counted the same way. */
	legends: readonly LineRow[];
	matchups: readonly MatchupRow[];
	/** All matches between decks of different lines; defaults to the matrix's own count. */
	crossMatchesTotal?: number;
}): MetaView {
	const total = input.lines.reduce((n, row) => n + row.decks, 0);

	const byLine = buildLines(input.lines);
	const byLegend = input.legends
		.flatMap((row) => (row.line ? [toStat(row, row.line, [row.line], total)] : []))
		.sort(ranked);

	const matrixLines = byLine.slice(0, MATRIX_SIZE).map((g) => g.key);

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
		byLegend,
		matrixLines,
		matrix,
		crossMatches,
		crossMatchesTotal: input.crossMatchesTotal ?? crossMatches
	};
}
