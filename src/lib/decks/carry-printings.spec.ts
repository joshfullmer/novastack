/**
 * What happens to Printing choices when the grant that allowed them is gone
 * (`carry-printings.ts`). The rule being pinned down is "the deck keeps its art; only changing it
 * is gated", and the failure this guards against is silent data loss on an unrelated edit.
 */
import { describe, expect, it } from 'vitest';
import { carryForwardPrintings } from './carry-printings.ts';
import type { DeckVersionPayload } from './schema.ts';

const stored: DeckVersionPayload = {
	entries: [
		{ cardSlug: 'japantown-jonin', quantity: 2, printingId: 'jonin-fr' },
		{ cardSlug: 'ruthless-lowlife', quantity: 1 }
	],
	sideboard: [{ cardSlug: 'chrome-fang', quantity: 1, printingId: 'fang-beta' }],
	legends: [{ cardSlug: 'royce', printingId: 'royce-fr' }, { cardSlug: 'adam-smasher' }]
};

describe('carryForwardPrintings', () => {
	it('re-applies stored printings to a payload that carries none', () => {
		// Exactly what an unentitled editor posts: the picker is hidden, so nothing sets a printing.
		const incoming: DeckVersionPayload = {
			entries: [
				{ cardSlug: 'japantown-jonin', quantity: 2 },
				{ cardSlug: 'ruthless-lowlife', quantity: 1 }
			],
			sideboard: [{ cardSlug: 'chrome-fang', quantity: 1 }],
			legends: [{ cardSlug: 'royce' }, { cardSlug: 'adam-smasher' }]
		};

		expect(carryForwardPrintings(stored, incoming)).toEqual(stored);
	});

	it('survives an unrelated edit — the whole point', () => {
		const incoming: DeckVersionPayload = {
			// Quantity changed, card added, sideboard emptied.
			entries: [
				{ cardSlug: 'japantown-jonin', quantity: 3 },
				{ cardSlug: 'ruthless-lowlife', quantity: 1 },
				{ cardSlug: 'new-card', quantity: 1 }
			],
			sideboard: [],
			legends: [{ cardSlug: 'royce' }, { cardSlug: 'adam-smasher' }]
		};

		const result = carryForwardPrintings(stored, incoming);
		expect(result.entries[0]).toEqual({
			cardSlug: 'japantown-jonin',
			quantity: 3,
			printingId: 'jonin-fr'
		});
		// A card they just added never had a choice to preserve.
		expect(result.entries[2]).toEqual({ cardSlug: 'new-card', quantity: 1 });
		expect(result.sideboard).toEqual([]);
		expect(result.legends[0]).toEqual({ cardSlug: 'royce', printingId: 'royce-fr' });
	});

	it('ignores printings an unentitled client tries to set', () => {
		const incoming: DeckVersionPayload = {
			entries: [{ cardSlug: 'japantown-jonin', quantity: 2, printingId: 'jonin-forged' }],
			sideboard: [],
			legends: [{ cardSlug: 'royce', printingId: 'royce-forged' }]
		};

		const result = carryForwardPrintings(stored, incoming);
		expect(result.entries[0].printingId).toBe('jonin-fr');
		expect(result.legends[0].printingId).toBe('royce-fr');
	});

	it('drops a printing for a card the stored version never chose one for', () => {
		const incoming: DeckVersionPayload = {
			entries: [{ cardSlug: 'ruthless-lowlife', quantity: 1, printingId: 'lowlife-beta' }],
			sideboard: [],
			legends: []
		};

		// Absent, not `undefined` — absence is what "use the default" means on the wire.
		expect(carryForwardPrintings(stored, incoming).entries[0]).toEqual({
			cardSlug: 'ruthless-lowlife',
			quantity: 1
		});
		expect('printingId' in carryForwardPrintings(stored, incoming).entries[0]).toBe(false);
	});

	it('carries a choice across piles — sideboarding a card keeps its art', () => {
		const incoming: DeckVersionPayload = {
			entries: [],
			sideboard: [{ cardSlug: 'japantown-jonin', quantity: 1 }],
			legends: []
		};
		expect(carryForwardPrintings(stored, incoming).sideboard[0].printingId).toBe('jonin-fr');
	});

	it('restores the art of a card removed and re-added', () => {
		const incoming: DeckVersionPayload = {
			entries: [{ cardSlug: 'japantown-jonin', quantity: 1 }],
			sideboard: [],
			legends: []
		};
		expect(carryForwardPrintings(stored, incoming).entries[0].printingId).toBe('jonin-fr');
	});

	it('drops every printing when there is no stored version yet', () => {
		const incoming: DeckVersionPayload = {
			entries: [{ cardSlug: 'a', quantity: 1, printingId: 'a-beta' }],
			sideboard: [{ cardSlug: 'b', quantity: 1, printingId: 'b-beta' }],
			legends: [{ cardSlug: 'c', printingId: 'c-beta' }]
		};

		expect(carryForwardPrintings(null, incoming)).toEqual({
			entries: [{ cardSlug: 'a', quantity: 1 }],
			sideboard: [{ cardSlug: 'b', quantity: 1 }],
			legends: [{ cardSlug: 'c' }]
		});
	});
});
