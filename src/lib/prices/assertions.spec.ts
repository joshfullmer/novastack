import { describe, expect, it } from 'vitest';
import { checkPriceInvariants, unknownTcgplayerGroups } from './assertions.ts';
import type { PriceReport } from './mapping.ts';

function report(overrides: {
	tcgplayer?: Partial<PriceReport['tcgplayer']>;
	cardmarket?: Partial<PriceReport['cardmarket']>;
}): PriceReport {
	return {
		tcgplayer: {
			noGroup: [],
			noProduct: [],
			nameMismatches: [],
			duplicateProducts: [],
			ambiguous: [],
			mapped: 100,
			...overrides.tcgplayer
		},
		cardmarket: {
			tied: [],
			paired: 0,
			nameNotFound: [],
			expansions: new Map(),
			mapped: 0,
			...overrides.cardmarket
		}
	};
}

const checks = (r: PriceReport) => checkPriceInvariants(r).map((violation) => violation.check);

describe('checkPriceInvariants', () => {
	it('passes a clean join', () => {
		expect(checks(report({}))).toEqual([]);
	});

	it('fails two Printings on one TCGplayer product', () => {
		const r = report({ tcgplayer: { duplicateProducts: [{ productId: 1, keys: ['a', 'b'] }] } });
		expect(checks(r)).toEqual(['tcgplayer-unique-products']);
	});

	it('tolerates a couple of name typos on their side, but not a wall of them', () => {
		const mismatch = { key: 'k', ours: 'a', theirs: 'b' };
		expect(checks(report({ tcgplayer: { nameMismatches: [mismatch, mismatch] } }))).toEqual([]);

		const wall = Array.from({ length: 10 }, () => mismatch);
		expect(checks(report({ tcgplayer: { nameMismatches: wall } }))).toEqual([
			'tcgplayer-names-agree'
		]);
	});

	it('fails a beta Printing that has a group but no product, and ignores the same gap in retail', () => {
		const beta = { key: 'MS01-WNC-β001', run: 'MS01-WNC|beta|en' };
		const retail = { key: 'MS01-WNC-143', run: 'MS01-WNC|retail|en' };
		expect(checks(report({ tcgplayer: { noProduct: [retail] } }))).toEqual([]);
		expect(checks(report({ tcgplayer: { noProduct: [beta, retail] } }))).toEqual([
			'tcgplayer-beta-complete'
		]);
	});

	it('fails an expansion that knows almost none of our names, not one with a small gap', () => {
		const wrong = report({
			cardmarket: { expansions: new Map([[6714, { ours: 172, found: 3 }]]) }
		});
		expect(checks(wrong)).toEqual(['cardmarket-expansion-names']);

		// 3 of our 4 promos: a hole in Cardmarket's catalogue, not a wrong id.
		const small = report({ cardmarket: { expansions: new Map([[6719, { ours: 4, found: 3 }]]) } });
		expect(checks(small)).toEqual([]);
	});
});

describe('unknownTcgplayerGroups', () => {
	it('reports a group nothing has decided about, and neither mapped nor ignored ones', () => {
		const listing = [
			{ groupId: 24845, name: 'Welcome to Night City - Beta' }, // mapped
			{ groupId: 24881, name: 'Alpha Kit' }, // knowingly ignored
			{ groupId: 99999, name: 'Set 2' }
		];
		expect(unknownTcgplayerGroups(listing)).toEqual([{ groupId: 99999, name: 'Set 2' }]);
	});
});
