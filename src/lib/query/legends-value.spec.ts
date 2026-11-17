/**
 * Spec §3.3: one unified rule for `legends:` values — a bare color letter contributes 1, a
 * digit-suffixed letter contributes that number, and the final total per color is the sum of
 * all its occurrences. Tally and digit spellings, and any mix of the two, must reduce
 * identically.
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET } from '#lib/filters/budget.js';
import { parseLegendsValue } from './legends-value.ts';

describe('parseLegendsValue', () => {
	it('parses a tally spelling', () => {
		expect(parseLegendsValue('rryyyy', 2)).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('parses a digit spelling identically', () => {
		expect(parseLegendsValue('r2y4', 2)).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('parses a mix of tally and digit spellings for the same value', () => {
		expect(parseLegendsValue('rry4', 2)).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('counts a lowercase letter as RAM and an uppercase one as a Legend', () => {
		// YYR: two Legends of yellow, one of red, each providing 2.
		expect(parseLegendsValue('YYR', 2)).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
		expect(parseLegendsValue('YYR', 2)).toEqual(parseLegendsValue('yyyyrr', 2));
		expect(parseLegendsValue('yyr', 2)).toEqual({ ...EMPTY_BUDGET, Red: 1, Yellow: 2 });
	});

	it('takes the size of a Legend from what Legends provide, but never changes lowercase', () => {
		expect(parseLegendsValue('YYR', 3)).toEqual({ ...EMPTY_BUDGET, Red: 3, Yellow: 6 });
		expect(parseLegendsValue('yyyyrr', 3)).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('lets a count scale either unit, and the two cases mix', () => {
		expect(parseLegendsValue('Y2', 2)).toEqual({ ...EMPTY_BUDGET, Yellow: 4 }); // two Legends
		expect(parseLegendsValue('y2', 2)).toEqual({ ...EMPTY_BUDGET, Yellow: 2 }); // two RAM
		expect(parseLegendsValue('YYr', 2)).toEqual({ ...EMPTY_BUDGET, Red: 1, Yellow: 4 });
	});

	it('accepts an optional comma as chrome between tokens', () => {
		expect(parseLegendsValue('r2,y4', 2)).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('does not care about order or interleaving', () => {
		expect(parseLegendsValue('ryry', 2)).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 2 });
	});

	it('defaults unmentioned colors to 0', () => {
		expect(parseLegendsValue('r2', 2)).toEqual({ ...EMPTY_BUDGET, Red: 2 });
	});

	it('has no upper bound', () => {
		expect(parseLegendsValue('r99', 2)).toEqual({ ...EMPTY_BUDGET, Red: 99 });
	});

	it('rejects an empty value as malformed', () => {
		expect(parseLegendsValue('', 2)).toBeNull();
	});

	it('rejects an unknown color letter as malformed', () => {
		expect(parseLegendsValue('x2', 2)).toBeNull();
	});

	it('rejects a negative number as malformed', () => {
		expect(parseLegendsValue('r-2', 2)).toBeNull();
	});
});
