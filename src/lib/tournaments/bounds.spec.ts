/**
 * A response never grows with the corpus: each builder lists a fixed number of rows and says what it
 * left out, so a page can be honest about it. The shares and counts still cover everything.
 */
import { describe, expect, it } from 'vitest';
import { buildCardUsage, FIT_LIMIT, type UsageRow } from './cards.ts';
import { buildMeta, LINE_LIMIT, type LineRow } from './meta.ts';

const lineRow = (n: number, decks: number): LineRow => ({
	line: `a-${n}+b-${n}+c-${n}`,
	decks,
	matchWins: decks,
	matchLosses: decks,
	matchDraws: 0,
	top8: 1,
	wins: 0,
	best: 4
});

describe('buildMeta', () => {
	// 120 lines: the first 100 have 3 decks each, the last 20 have 1 each.
	const lines = Array.from({ length: 120 }, (_, i) => lineRow(i, i < 100 ? 3 : 1));
	const meta = buildMeta({
		lines,
		rams: [
			{ ...lineRow(0, 200), line: 'rryyyy' },
			{ ...lineRow(1, 120), line: 'rrrryy' }
		],
		legends: [],
		matchups: []
	});

	it('lists the most-played lines only, and counts the rest', () => {
		expect(meta.byLine).toHaveLength(LINE_LIMIT);
		expect(meta.unlisted).toEqual({ lines: 20, decks: 20, top8: 20, wins: 0 });
		expect(meta.byLine.every((g) => g.decks === 3)).toBe(true);
	});

	it('still takes every deck as the denominator of a share', () => {
		expect(meta.decks).toBe(320);
		expect(meta.byLine[0]?.share).toBeCloseTo(3 / 320);
	});

	it('counts the RAM groups over every deck, listed lines or not', () => {
		expect(meta.byRam.map((g) => [g.key, g.decks])).toEqual([
			['rryyyy', 200],
			['rrrryy', 120]
		]);
	});
});

describe('buildCardUsage', () => {
	const rows: UsageRow[] = Array.from({ length: 250 }, (_, i) => ({
		rank: i + 1,
		line: `a-${i % 40}+b+c`,
		ram: `r${'y'.repeat(1 + (i % 30))}`,
		main: 3,
		side: 0,
		asLegend: false
	}));
	const usage = buildCardUsage({
		slug: 'x',
		rows,
		totals: { decks: 500, winners: 5, top8: 40 },
		lines: Array.from({ length: 40 }, (_, i) => ({ line: `a-${i}+b+c`, decks: 20 })),
		rams: Array.from({ length: 30 }, (_, i) => ({ line: `r${'y'.repeat(1 + i)}`, decks: 20 }))
	});

	it('counts every deck that ran it', () => {
		expect(usage.decks).toBe(250);
		expect(usage.top8).toBe(8);
	});

	it('lists the lines that run it most, and says how many there are', () => {
		expect(usage.byLine).toHaveLength(FIT_LIMIT);
		expect(usage.lineCount).toBe(40);
	});

	it('lists the RAMs that run it most, and says how many there are', () => {
		expect(usage.byRam).toHaveLength(FIT_LIMIT);
		expect(usage.ramCount).toBe(30);
	});
});
