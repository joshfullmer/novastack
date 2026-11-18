/**
 * Card statistics from tournament decks: what is played (`docs/spec/tournaments.md` §6), and one
 * Card's own usage and finishes.
 *
 * Pure: the database counts, this shapes. A Card's *inclusion* is the share of decks in scope that run
 * it in their main deck; a Card played only from the sideboard has `inclusion` 0 and a `sideDecks` count.
 */
import type { LineRow } from './meta.ts';

export type CardStatRow = { slug: string; mainDecks: number; copies: number; sideDecks: number };

export type CardStat = {
	slug: string;
	/** Decks running it in the main deck. */
	decks: number;
	/** Of the decks in scope. */
	inclusion: number;
	/** Copies per deck that runs it. */
	avgCopies: number;
	/** Decks running it in the sideboard. */
	sideDecks: number;
};

/** Most-included first; a tie goes to the name so the order is stable. */
export function buildCardStats(rows: readonly CardStatRow[], decksInScope: number): CardStat[] {
	return rows
		.map((row): CardStat => ({
			slug: row.slug,
			decks: row.mainDecks,
			inclusion: decksInScope ? row.mainDecks / decksInScope : 0,
			avgCopies: row.mainDecks ? row.copies / row.mainDecks : 0,
			sideDecks: row.sideDecks
		}))
		.sort((a, b) => b.inclusion - a.inclusion || a.slug.localeCompare(b.slug));
}

/** One deck that ran the Card: where it finished and what it was, nothing to list it by. */
export type UsageRow = {
	rank: number;
	line: string | null;
	ram: string | null;
	/** Copies in the main deck and in the sideboard; both 0 when it was a Legend. */
	main: number;
	side: number;
	asLegend: boolean;
};

/** The Legend lines, and the RAMs, listed as running a Card, most-using first. */
export const FIT_LIMIT = 25;

export type CardUsage = {
	slug: string;
	/** Decks in scope. */
	totalDecks: number;
	/** Decks that ran it anywhere (main, side or as a Legend). */
	decks: number;
	inclusion: number;
	avgCopies: number;
	inSide: number;
	asLegend: number;
	/** Decks that ran it and won / reached top 8. */
	winners: number;
	top8: number;
	/** Decks in scope that won / reached top 8, whether or not they ran it. */
	allWinners: number;
	allTop8: number;
	/** For each Legend line that ran it: how many of that line's decks did. */
	byLine: { line: string; legends: string[]; decks: number; withCard: number; rate: number }[];
	/** How many lines ran it, of which `byLine` lists the first `FIT_LIMIT`. */
	lineCount: number;
	/** The same for each RAM (`rryyyy`): how many of that RAM's decks ran it. */
	byRam: { ram: string; decks: number; withCard: number; rate: number }[];
	/** How many RAMs ran it, of which `byRam` lists the first `FIT_LIMIT`. */
	ramCount: number;
};

export function buildCardUsage(input: {
	slug: string;
	rows: readonly UsageRow[];
	totals: { decks: number; winners: number; top8: number };
	/** Every Legend line in scope with its deck count: the denominator of each line's rate. */
	lines: readonly Pick<LineRow, 'line' | 'decks'>[];
	/** Every RAM in scope with its deck count, likewise. */
	rams: readonly Pick<LineRow, 'line' | 'decks'>[];
}): CardUsage {
	const { rows, totals } = input;
	const inMain = rows.filter((row) => row.main > 0);
	const withCard = new Map<string, number>();
	for (const row of rows) {
		if (row.line) withCard.set(row.line, (withCard.get(row.line) ?? 0) + 1);
	}

	const ramsWith = new Map<string, number>();
	for (const row of rows) {
		if (row.ram) ramsWith.set(row.ram, (ramsWith.get(row.ram) ?? 0) + 1);
	}
	const ramFits = input.rams
		.flatMap((group) => {
			const n = group.line ? (ramsWith.get(group.line) ?? 0) : 0;
			return group.line && n > 0
				? [{ ram: group.line, decks: group.decks, withCard: n, rate: n / group.decks }]
				: [];
		})
		.sort((a, b) => b.withCard - a.withCard || b.rate - a.rate || a.ram.localeCompare(b.ram));

	const fits = input.lines
		.flatMap((line) => {
			const n = line.line ? (withCard.get(line.line) ?? 0) : 0;
			return line.line && n > 0
				? [
						{
							line: line.line,
							legends: line.line.split('+'),
							decks: line.decks,
							withCard: n,
							rate: n / line.decks
						}
					]
				: [];
		})
		.sort((a, b) => b.withCard - a.withCard || b.rate - a.rate || a.line.localeCompare(b.line));

	return {
		slug: input.slug,
		totalDecks: totals.decks,
		decks: rows.length,
		inclusion: totals.decks ? rows.length / totals.decks : 0,
		avgCopies: inMain.length ? inMain.reduce((n, row) => n + row.main, 0) / inMain.length : 0,
		inSide: rows.filter((row) => row.side > 0).length,
		asLegend: rows.filter((row) => row.asLegend).length,
		winners: rows.filter((row) => row.rank === 1).length,
		top8: rows.filter((row) => row.rank <= 8).length,
		allWinners: totals.winners,
		allTop8: totals.top8,
		byLine: fits.slice(0, FIT_LIMIT),
		lineCount: fits.length,
		byRam: ramFits.slice(0, FIT_LIMIT),
		ramCount: ramFits.length
	};
}
