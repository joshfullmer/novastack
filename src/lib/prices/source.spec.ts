import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICE_SOURCE, parsePriceSource } from './source.svelte.ts';

describe('parsePriceSource', () => {
	it('reads either marketplace back', () => {
		expect(parsePriceSource('tcgplayer')).toBe('tcgplayer');
		expect(parsePriceSource('cardmarket')).toBe('cardmarket');
	});

	it('is TCGplayer when nothing is stored', () => {
		expect(parsePriceSource(null)).toBe('tcgplayer');
		expect(DEFAULT_PRICE_SOURCE).toBe('tcgplayer');
	});

	it('is the default for a value it does not recognise, not an error', () => {
		for (const stale of ['', 'both', 'Cardmarket', 'TCGPLAYER', '{"v":1}']) {
			expect(parsePriceSource(stale)).toBe('tcgplayer');
		}
	});
});
