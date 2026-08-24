/**
 * Deck legality (`legality.ts`) is pure functions over synthetic Card/DeckEntry fixtures — see
 * `docs/spec/deckbuilder.md` §2 and §4 for the rules these implement.
 */
import { describe, expect, it } from 'vitest';
import { makeCard } from '#lib/cards/fixtures.js';
import { EMPTY_BUDGET } from '#lib/filters/budget.js';
import {
	MAX_DECK_SIZE,
	MIN_DECK_SIZE,
	budgetFromLegends,
	deckSizeStatus,
	ramViolations,
	type DeckEntry
} from './legality.js';

describe('budgetFromLegends', () => {
	it('sums each chosen Legend’s own ramProvided per color, not a slot count × a constant', () => {
		const legends = [
			makeCard({ color: 'Red', cardType: 'Legend', ramProvided: 2 }),
			makeCard({ color: 'Red', cardType: 'Legend', ramProvided: 3 }), // deliberately non-uniform
			makeCard({ color: 'Blue', cardType: 'Legend', ramProvided: 2 })
		];

		expect(budgetFromLegends(legends)).toEqual({ Red: 5, Blue: 2, Yellow: 0, Green: 0 });
	});

	it('is the empty budget for zero Legends', () => {
		expect(budgetFromLegends([])).toEqual(EMPTY_BUDGET);
	});

	it('treats a null ramProvided as zero', () => {
		const legends = [makeCard({ color: 'Green', cardType: 'Legend', ramProvided: null })];
		expect(budgetFromLegends(legends)).toEqual({ Red: 0, Yellow: 0, Green: 0, Blue: 0 });
	});
});

describe('deckSizeStatus', () => {
	it('is "under" below the minimum, "legal" within range, "over" above the maximum', () => {
		expect(deckSizeStatus(MIN_DECK_SIZE - 1)).toBe('under');
		expect(deckSizeStatus(MIN_DECK_SIZE)).toBe('legal');
		expect(deckSizeStatus(MAX_DECK_SIZE)).toBe('legal');
		expect(deckSizeStatus(MAX_DECK_SIZE + 1)).toBe('over');
	});
});

describe('ramViolations', () => {
	it('lists entries whose card the current budget does not admit', () => {
		const budget = { Red: 2, Yellow: 0, Green: 0, Blue: 0 };
		const withinBudget: DeckEntry = {
			card: makeCard({ color: 'Red', cardType: 'Unit', ramRequired: 2 }),
			quantity: 1
		};
		const overBudget: DeckEntry = {
			card: makeCard({ color: 'Red', cardType: 'Unit', ramRequired: 3 }),
			quantity: 1
		};
		const offColor: DeckEntry = {
			card: makeCard({ color: 'Blue', cardType: 'Unit', ramRequired: 0 }),
			quantity: 1
		};

		expect(ramViolations([withinBudget, overBudget, offColor], budget)).toEqual([
			overBudget,
			offColor
		]);
	});

	it('is empty when every entry is admitted, including the empty-deck case', () => {
		expect(ramViolations([], EMPTY_BUDGET)).toEqual([]);
	});

	it('flags every entry against an empty budget (zero Legends chosen)', () => {
		const entry: DeckEntry = {
			card: makeCard({ color: 'Red', cardType: 'Unit', ramRequired: 0 }),
			quantity: 1
		};
		expect(ramViolations([entry], EMPTY_BUDGET)).toEqual([entry]);
	});
});
