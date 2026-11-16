import { describe, expect, it } from 'vitest';
import { fieldByColour, ordinal } from './present.ts';

describe('ordinal', () => {
	it.each([
		[1, '1st'],
		[2, '2nd'],
		[3, '3rd'],
		[4, '4th'],
		[7, '7th'],
		[11, '11th'],
		[12, '12th'],
		[13, '13th'],
		[21, '21st'],
		[22, '22nd'],
		[101, '101st'],
		[111, '111th']
	])('%i is %s', (n, expected) => {
		expect(ordinal(n)).toBe(expected);
	});
});

describe('fieldByColour', () => {
	it('is empty for a Legend the dataset does not know, rather than guessing a colour', () => {
		expect(fieldByColour([{ slug: 'not-a-card', decks: 3 }])).toEqual([]);
	});

	it('weights segments by decks and sums to 100', () => {
		const known = fieldByColour([
			{ slug: 'v-streetkid', decks: 1 },
			{ slug: 'v-streetkid', decks: 1 }
		]);
		expect(known).toHaveLength(1);
		expect(known[0].width).toBeCloseTo(100);
	});
});
