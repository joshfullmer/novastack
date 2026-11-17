/** A bar on the cost curve narrows a deck's list to the cards at that cost. */
import { describe, expect, it } from 'vitest';
import { dataset } from '#lib/cards/index.js';
import type { DeckEntry } from './legality.ts';
import { atCost, costCurve } from './stats.ts';

const withCost = (cost: number | null) => dataset.cards.find((card) => card.cost === cost);
const entry = (cost: number | null, quantity: number): DeckEntry => {
	const card = withCost(cost);
	if (!card) throw new Error(`no card costs ${cost}`);
	return { card, quantity };
};

describe('atCost', () => {
	const entries = [entry(1, 3), entry(3, 2), entry(3, 1)];

	it('is every entry when nothing is picked', () => {
		expect(atCost(entries, null)).toEqual(entries);
	});

	it('is only the entries at the picked cost', () => {
		expect(atCost(entries, { cost: 3 })).toEqual([entries[1], entries[2]]);
		expect(atCost(entries, { cost: 1 })).toEqual([entries[0]]);
	});

	it('is none for a cost nothing is at', () => {
		expect(atCost(entries, { cost: 6 })).toEqual([]);
	});

	it('agrees with the bar it came from', () => {
		const bar = costCurve(entries).find((bucket) => bucket.cost === 3);
		const shown = atCost(entries, { cost: 3 });
		expect(shown.reduce((n, e) => n + e.quantity, 0)).toBe(bar?.quantity);
	});
});
