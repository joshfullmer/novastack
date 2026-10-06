import { describe, expect, it } from 'vitest';
import { dataset } from '#lib/cards/index.js';
import { createDeckState } from './deck-state.svelte.js';

const card = (name: string) => {
	const found = dataset.cards.find((candidate) => candidate.name === name);
	if (!found) throw new Error(`fixture card missing from the dataset: ${name}`);
	return found;
};

describe('replaceWith', () => {
	const fang = card('Chrome Fang');
	const kiroshi = card('Kiroshi Optics');
	const streetkid = card('V: Streetkid');
	const printing = (c: typeof fang, index: number) => c.printings[index].id;

	it('swaps all three piles for the imported ones', () => {
		const deck = createDeckState({
			entries: [{ cardSlug: fang.slug, quantity: 3 }],
			legends: [{ cardSlug: streetkid.slug }],
			sideboard: []
		});
		deck.replaceWith({
			legends: [],
			entries: [{ card: kiroshi, quantity: 2 }],
			sideboard: [{ card: fang, quantity: 1 }]
		});
		expect(deck.legends).toEqual([]);
		expect(deck.entries.map((entry) => [entry.card.slug, entry.quantity])).toEqual([
			[kiroshi.slug, 2]
		]);
		expect(deck.sideboard.map((entry) => [entry.card.slug, entry.quantity])).toEqual([
			[fang.slug, 1]
		]);
	});

	it('keeps a chosen Printing for a Card that was already in the draft, in either pile or a Legend slot', () => {
		const deck = createDeckState({
			entries: [{ cardSlug: fang.slug, quantity: 2, printingId: printing(fang, 1) }],
			legends: [{ cardSlug: streetkid.slug, printingId: printing(streetkid, 1) }],
			sideboard: []
		});
		deck.replaceWith({
			legends: [streetkid],
			entries: [],
			sideboard: [
				{ card: fang, quantity: 1 },
				{ card: kiroshi, quantity: 1 }
			]
		});
		expect(deck.printingIdOf(fang)).toBe(printing(fang, 1));
		expect(deck.printingIdOf(streetkid)).toBe(printing(streetkid, 1));
		expect(deck.printingIdOf(kiroshi)).toBeUndefined();
		expect(deck.toPayload().sideboard).toEqual([
			{ cardSlug: fang.slug, quantity: 1, printingId: printing(fang, 1) },
			{ cardSlug: kiroshi.slug, quantity: 1, printingId: undefined }
		]);
	});

	it('does not resurrect the printing of a Card the import dropped', () => {
		const deck = createDeckState({
			entries: [{ cardSlug: fang.slug, quantity: 1, printingId: printing(fang, 1) }],
			legends: [],
			sideboard: []
		});
		deck.replaceWith({ legends: [], entries: [{ card: kiroshi, quantity: 1 }], sideboard: [] });
		deck.replaceWith({ legends: [], entries: [{ card: fang, quantity: 1 }], sideboard: [] });
		expect(deck.printingIdOf(fang)).toBeUndefined();
	});
});
