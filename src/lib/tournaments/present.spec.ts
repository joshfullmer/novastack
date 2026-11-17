import { describe, expect, it } from 'vitest';
import { dataset } from '../cards/index.ts';
import type { GroupStat } from './meta.ts';
import { coloursOf, fieldByColour, groupByColours, ordinal, wherePlayed } from './present.ts';

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

describe('colours', () => {
	const legendOf = (colour: string) => {
		const card = dataset.cards.find((c) => c.cardType === 'Legend' && c.color === colour);
		if (!card) throw new Error(`no ${colour} Legend in the dataset`);
		return card.slug;
	};
	const red = legendOf('Red');
	const blue = legendOf('Blue');
	const line = (
		legends: string[],
		decks: number,
		winRate: number | null,
		matches: number
	): GroupStat => ({
		key: legends.join('+'),
		legends,
		decks,
		share: decks / 10,
		winRate,
		matches,
		top8: decks,
		wins: 1
	});

	it('lists the colours of a set of Legends in a fixed order, once each', () => {
		expect(coloursOf([blue, red, red])).toEqual(['Red', 'Blue']);
		expect(coloursOf(['not-a-card'])).toEqual([]);
	});

	it('rolls Legend lines up by colour, summing decks and weighting the win rate by matches', () => {
		const groups = groupByColours([
			line([red, blue], 4, 0.5, 8), // Red+Blue
			line([blue, red], 2, 1, 2), // Red+Blue again: 8 + 2 matches
			line([red], 1, 0, 3) // Red only
		]);
		const redBlue = groups.find((g) => g.key === 'Red+Blue');
		expect(redBlue).toMatchObject({ decks: 6, matches: 10, top8: 6, wins: 2 });
		expect(redBlue?.share).toBeCloseTo(0.6);
		expect(redBlue?.winRate).toBeCloseTo((0.5 * 8 + 1 * 2) / 10);
		expect(groups.find((g) => g.key === 'Red')).toMatchObject({ decks: 1, winRate: 0 });
		expect(groups[0].key).toBe('Red+Blue'); // most decks first
	});

	it('files a line of unknown Legends under a placeholder rather than dropping it', () => {
		expect(groupByColours([line(['nope'], 1, null, 0)])[0]).toMatchObject({
			key: '—',
			winRate: null
		});
	});
});
