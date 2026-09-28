import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '#lib/cards/fixtures.js';
import { deckPrinting, isDefaultPrinting } from './printing.ts';

const card = makeCard({
	slug: 'adam-smasher',
	printings: [
		makePrinting({ id: 'adam-retail', setId: 'MS01-WNC', collectorNumber: '001' }),
		makePrinting({ id: 'adam-beta', setId: 'MS01-WNC', collectorNumber: 'β001' })
	]
});

describe('deckPrinting', () => {
	it('returns the Default Printing when the entry names none', () => {
		expect(deckPrinting(card).id).toBe('adam-retail');
	});

	it('returns the named printing', () => {
		expect(deckPrinting(card, 'adam-beta').id).toBe('adam-beta');
	});

	it('falls back to the default for an id that has left the dataset', () => {
		// The case this function exists for: a saved deck outliving a re-ingest must still render.
		expect(deckPrinting(card, 'adam-from-a-deleted-set').id).toBe('adam-retail');
	});
});

describe('isDefaultPrinting', () => {
	it('is true for no choice and for a choice that happens to be the default', () => {
		expect(isDefaultPrinting(card)).toBe(true);
		expect(isDefaultPrinting(card, 'adam-retail')).toBe(true);
	});

	it('is false for a deliberate non-default choice', () => {
		expect(isDefaultPrinting(card, 'adam-beta')).toBe(false);
	});

	it('is true for a stale id, since that is what renders', () => {
		expect(isDefaultPrinting(card, 'adam-gone')).toBe(true);
	});
});
