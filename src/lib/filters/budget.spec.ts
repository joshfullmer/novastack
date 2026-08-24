/**
 * The colored RAM budget (`budget.ts`) is a pure function of budget and card, so it's tested
 * against synthetic fixtures rather than the real snapshot — a reader can see the whole
 * dataset an assertion runs against, and the test survives the card count changing under it.
 * (An earlier version of this test hardcoded "57 of 133" against the real snapshot and had to
 * be re-verified by hand every time the dataset grew.)
 */
import { describe, expect, it } from 'vitest';
import { makeCards } from '#lib/cards/fixtures.js';
import { admits, budgetFromLegendColors, isEmptyBudget, EMPTY_BUDGET } from './budget.js';

describe('budgetFromLegendColors', () => {
	it('sums RAM per color across the three slots', () => {
		expect(budgetFromLegendColors(['Red', 'Red', 'Blue'], 2)).toEqual({
			Red: 4,
			Blue: 2,
			Yellow: 0,
			Green: 0
		});
	});

	it('leaves every color at zero for a partial or empty deck', () => {
		expect(budgetFromLegendColors([], 2)).toEqual(EMPTY_BUDGET);
		expect(budgetFromLegendColors(['Green'], 2)).toEqual({
			Red: 0,
			Yellow: 0,
			Green: 2,
			Blue: 0
		});
	});
});

describe('isEmptyBudget', () => {
	it('is true only when every slot is zero', () => {
		expect(isEmptyBudget(EMPTY_BUDGET)).toBe(true);
		expect(isEmptyBudget(budgetFromLegendColors(['Red'], 2))).toBe(false);
	});
});

describe('admits', () => {
	const budget = budgetFromLegendColors(['Red', 'Red', 'Blue'], 2); // Red: 4, Blue: 2

	it('excludes a card whose color has no budget, Legends included', () => {
		const [offColorUnit, offColorLegend] = makeCards([
			{ color: 'Green', cardType: 'Unit', ramRequired: 0 },
			{ color: 'Yellow', cardType: 'Legend' }
		]);
		expect(admits(budget, offColorUnit)).toBe(false);
		expect(admits(budget, offColorLegend)).toBe(false);
	});

	it('admits an on-color Legend regardless of RAM', () => {
		const [legend] = makeCards([{ color: 'Red', cardType: 'Legend' }]);
		expect(admits(budget, legend)).toBe(true);
	});

	it('admits a non-Legend exactly at the threshold, and excludes one over it', () => {
		const [atThreshold, overThreshold] = makeCards([
			{ color: 'Blue', cardType: 'Unit', ramRequired: 2 },
			{ color: 'Blue', cardType: 'Unit', ramRequired: 3 }
		]);
		expect(admits(budget, atThreshold)).toBe(true);
		expect(admits(budget, overThreshold)).toBe(false);
	});

	it('treats a null RAM requirement as zero', () => {
		const [noRequirement] = makeCards([{ color: 'Red', cardType: 'Program', ramRequired: null }]);
		expect(admits(budget, noRequirement)).toBe(true);
	});
});
