/**
 * Chip write-back (spec §9): a facet edit rewrites only that facet's own clause(s), leaving
 * every other clause — including read-only ones the chips can't touch — exactly as typed.
 */
import { describe, expect, it } from 'vitest';
import { createDataset } from '#lib/cards/dataset.js';
import { makeCard, makeSnapshot } from '#lib/cards/fixtures.js';
import { withFacetEdit } from './query-edit.js';

const dataset = createDataset(makeSnapshot([makeCard()]));

describe('withFacetEdit', () => {
	it('appends a clause to an empty query', () => {
		// Values serialise in their display casing, matching ticket 02's "canonical output is
		// the display form" — both parse identically either way, since fields are case-insensitive.
		expect(withFacetEdit('', dataset, { facet: 'color', values: ['Red'] })).toBe('color:Red');
	});

	it('serialises multi-select as an or group', () => {
		expect(withFacetEdit('', dataset, { facet: 'color', values: ['Red', 'Blue'] })).toBe(
			'(color:Red or color:Blue)'
		);
	});

	it('replaces the facet in place, leaving an unrelated clause untouched', () => {
		const next = withFacetEdit('color:red type:legend', dataset, {
			facet: 'color',
			values: ['Blue']
		});
		expect(next).toBe('color:Blue type:legend');
	});

	it('clears a facet back to absent', () => {
		expect(withFacetEdit('color:red type:legend', dataset, { facet: 'color', values: [] })).toBe(
			'type:legend'
		);
	});

	it('leaves read-only text (an or across facets) completely alone while editing another facet', () => {
		const next = withFacetEdit('(type:legend or color:red) cost:3', dataset, {
			facet: 'power',
			range: { min: 1, max: 5, includeNull: false }
		});
		expect(next).toBe('1<=power<=5 (type:legend or color:red) cost:3');
	});

	it('quotes a multi-word value', () => {
		expect(withFacetEdit('', dataset, { facet: 'tag', values: ['Tyger Claws'] })).toBe(
			'tag:"Tyger Claws"'
		);
	});

	it('serialises a numeric range', () => {
		expect(
			withFacetEdit('', dataset, { facet: 'cost', range: { min: 2, max: 4, includeNull: false } })
		).toBe('2<=cost<=4');
		expect(
			withFacetEdit('', dataset, { facet: 'cost', range: { min: 3, max: 3, includeNull: false } })
		).toBe('cost:3');
	});

	it('composes a bound with the null bucket for + none', () => {
		expect(
			withFacetEdit('', dataset, { facet: 'cost', range: { min: 2, max: 4, includeNull: true } })
		).toBe('(2<=cost<=4 or cost:none)');
	});

	it('clears a range back to unfiltered', () => {
		const next = withFacetEdit('cost:3', dataset, {
			facet: 'cost',
			range: { min: null, max: null, includeNull: true }
		});
		expect(next).toBe('');
	});

	it('serialises legend colors as a tally, in RAM points not slot counts', () => {
		// Two Red slots at ramPerLegend=2 is 4 Red RAM, tallying as four letters, not two.
		expect(withFacetEdit('', dataset, { facet: 'legends', colors: ['Red', 'Red', 'Blue'] })).toBe(
			'legends:bbrrrr'
		);
	});

	it('round-trips through the parser back to the same interactive value', async () => {
		const { parseQuery } = await import('#lib/query/index.js');
		const { readChipView } = await import('./chips.js');
		const next = withFacetEdit('type:legend', dataset, { facet: 'color', values: ['Red', 'Blue'] });
		const { predicate } = parseQuery(next, dataset);
		const view = readChipView(predicate, dataset);
		expect(view.colors).toEqual({ interactive: true, value: ['Red', 'Blue'] });
		expect(view.cardTypes).toEqual({ interactive: true, value: ['Legend'] });
	});
});
