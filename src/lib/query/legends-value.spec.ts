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
		expect(parseLegendsValue('rryyyy')).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('parses a digit spelling identically', () => {
		expect(parseLegendsValue('r2y4')).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('parses a mix of tally and digit spellings for the same value', () => {
		expect(parseLegendsValue('rry4')).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('is case-insensitive', () => {
		expect(parseLegendsValue('R2Y4')).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('accepts an optional comma as chrome between tokens', () => {
		expect(parseLegendsValue('r2,y4')).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 4 });
	});

	it('does not care about order or interleaving', () => {
		expect(parseLegendsValue('ryry')).toEqual({ ...EMPTY_BUDGET, Red: 2, Yellow: 2 });
	});

	it('defaults unmentioned colors to 0', () => {
		expect(parseLegendsValue('r2')).toEqual({ ...EMPTY_BUDGET, Red: 2 });
	});

	it('has no upper bound', () => {
		expect(parseLegendsValue('r99')).toEqual({ ...EMPTY_BUDGET, Red: 99 });
	});

	it('rejects an empty value as malformed', () => {
		expect(parseLegendsValue('')).toBeNull();
	});

	it('rejects an unknown color letter as malformed', () => {
		expect(parseLegendsValue('x2')).toBeNull();
	});

	it('rejects a negative number as malformed', () => {
		expect(parseLegendsValue('r-2')).toBeNull();
	});
});
