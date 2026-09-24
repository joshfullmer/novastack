/**
 * Printing Runs and Goal-scoped completion (`goal.ts`), over hand-built worlds small enough to
 * check by hand rather than against all 700 printings.
 */
import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '#lib/cards/fixtures.js';
import {
	DEFAULT_GOAL,
	PRINTING_RUNS,
	completion,
	inGoal,
	printingRunsOf,
	rarityProgress,
	runKey,
	setProgress,
	totalCopies
} from './goal.ts';

/** A Base Set with all three real treatments/locales, plus a retail-only derivative set. */
const cards = [
	makeCard({
		slug: 'both-treatments',
		printings: [
			makePrinting({ id: 'en-retail', setId: 'MS01-WNC', collectorNumber: '001' }),
			makePrinting({ id: 'en-beta', setId: 'MS01-WNC', collectorNumber: 'β001' }),
			makePrinting({ id: 'fr-retail', setId: 'MS01-WNC', collectorNumber: '001', locale: 'fr' })
		]
	}),
	makeCard({
		slug: 'derivative-only',
		printings: [makePrinting({ id: 'heist', setId: 'SD01-HEI', collectorNumber: '001' })]
	})
];

const SET_ORDER = ['MS01-WNC', 'SD01-HEI'];
const EN_RETAIL_ONLY = new Set([
	runKey('MS01-WNC', 'retail', 'en'),
	runKey('SD01-HEI', 'retail', 'en')
]);

const owned: Record<string, number> = { 'en-retail': 2, 'fr-retail': 1 };
const ownedOf = (id: string) => owned[id] ?? 0;

describe('printing runs', () => {
	it('derives one run per (set, treatment, locale) that actually exists', () => {
		expect(printingRunsOf(cards, SET_ORDER)).toEqual([
			{ key: 'MS01-WNC|beta|en', setId: 'MS01-WNC', treatment: 'beta', locale: 'en', printings: 1 },
			{
				key: 'MS01-WNC|retail|en',
				setId: 'MS01-WNC',
				treatment: 'retail',
				locale: 'en',
				printings: 1
			},
			{
				key: 'MS01-WNC|retail|fr',
				setId: 'MS01-WNC',
				treatment: 'retail',
				locale: 'fr',
				printings: 1
			},
			{
				key: 'SD01-HEI|retail|en',
				setId: 'SD01-HEI',
				treatment: 'retail',
				locale: 'en',
				printings: 1
			}
		]);
	});

	it('never invents a combination that was not printed', () => {
		// There is no French beta run in the real data, and none here either.
		const keys = printingRunsOf(cards, SET_ORDER).map((run) => run.key);
		expect(keys).not.toContain('MS01-WNC|beta|fr');
	});

	it('reads beta off the printed collector number, not the set', () => {
		// Both β001 and 001 carry the same setId — the `β` prefix is the only distinction.
		const beta = printingRunsOf(cards, SET_ORDER).find((run) => run.treatment === 'beta');
		expect(beta?.setId).toBe('MS01-WNC');
	});
});

describe('the real dataset', () => {
	it('has seventeen runs, and defaults to the English retail ones', () => {
		expect(PRINTING_RUNS).toHaveLength(17);
		expect([...DEFAULT_GOAL]).toHaveLength(12);
		// Every Set is included by default; only treatment and locale narrow it.
		expect([...DEFAULT_GOAL].every((key) => key.endsWith('|retail|en'))).toBe(true);
	});

	it('defaults to a denominator well under the full printing count', () => {
		const inDefault = PRINTING_RUNS.filter((run) => DEFAULT_GOAL.has(run.key));
		const total = PRINTING_RUNS.reduce((sum, run) => sum + run.printings, 0);
		const scoped = inDefault.reduce((sum, run) => sum + run.printings, 0);
		// The whole reason for a default: 332 of 700, not 700 of 700.
		expect(scoped).toBeLessThan(total / 1.5);
	});
});

describe('completion is goal-scoped', () => {
	it('counts only In-Goal printings on both sides of the fraction', () => {
		// en-retail is owned and In Goal; fr-retail is owned but Off Goal; heist is In Goal, unowned.
		expect(completion(cards, EN_RETAIL_ONLY, ownedOf)).toEqual({
			owned: 1,
			total: 2,
			percent: 50
		});
	});

	it('changes with the goal, not with what is owned', () => {
		const frOnly = new Set([runKey('MS01-WNC', 'retail', 'fr')]);
		expect(completion(cards, frOnly, ownedOf)).toEqual({ owned: 1, total: 1, percent: 100 });

		const betaOnly = new Set([runKey('MS01-WNC', 'beta', 'en')]);
		expect(completion(cards, betaOnly, ownedOf)).toEqual({ owned: 0, total: 1, percent: 0 });
	});

	it('reports an empty goal as 0% rather than dividing by zero', () => {
		expect(completion(cards, new Set(), ownedOf)).toEqual({ owned: 0, total: 0, percent: 0 });
	});

	it('marks Off Goal printings as not counting, without hiding what is owned', () => {
		expect(inGoal(cards[0].printings[2], EN_RETAIL_ONLY)).toBe(false);
		// Still yours: the copy total is about ownership, not about the goal.
		expect(totalCopies(cards, ownedOf)).toBe(3);
	});
});

describe('per-set and per-rarity breakdowns', () => {
	it('scopes a set to its In-Goal printings only', () => {
		// MS01-WNC has three printings but only one is In Goal under en-retail.
		expect(setProgress(cards, 'MS01-WNC', EN_RETAIL_ONLY, ownedOf)).toEqual({
			owned: 1,
			total: 1,
			percent: 100
		});
	});

	it('reports a fully Off Goal set as total 0, so it can read as "not collecting"', () => {
		const frOnly = new Set([runKey('MS01-WNC', 'retail', 'fr')]);
		expect(setProgress(cards, 'SD01-HEI', frOnly, ownedOf)).toEqual({
			owned: 0,
			total: 0,
			percent: 0
		});
	});

	it('drops rarities with nothing In Goal rather than listing them at 0/0', () => {
		const rows = rarityProgress(cards, ['Common', 'Iconic Legend'], EN_RETAIL_ONLY, ownedOf);
		expect(rows.map((row) => row.rarity)).toEqual(['Common']);
		expect(rows[0]).toMatchObject({ owned: 1, total: 2 });
	});
});
