import { describe, expect, it } from 'vitest';
import { fieldByColour, ordinal, wherePlayed } from './present.ts';

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

describe('wherePlayed', () => {
	it('shows just the organizer when there is no venue', () => {
		expect(wherePlayed('Holodex', null)).toBe('Holodex');
	});

	it('does not repeat an organizer that is also the venue', () => {
		expect(wherePlayed('Holodex', 'Holodex')).toBe('Holodex');
		expect(wherePlayed('Holodex', 'HOLODEX')).toBe('HOLODEX');
	});

	it('shows the more specific one when one contains the other', () => {
		expect(wherePlayed('Nexus Entertainment', 'Nexus Entertainment - Tempe')).toBe(
			'Nexus Entertainment - Tempe'
		);
		expect(wherePlayed('Eternal Universe Games Lubbock', 'Eternal Universe Games')).toBe(
			'Eternal Universe Games Lubbock'
		);
	});

	it('shows both when they are different places', () => {
		expect(wherePlayed('The_hungry_dragon', 'the hungry dragon')).toBe(
			'The_hungry_dragon · the hungry dragon'
		);
	});
});
