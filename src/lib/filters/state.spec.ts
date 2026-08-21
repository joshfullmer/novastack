import { describe, expect, it } from 'vitest';
import { createDataset } from '#lib/cards/dataset.js';
import { makeCard, makePrinting, makeSnapshot } from '#lib/cards/fixtures.js';
import { evaluate } from './predicate.js';
import {
	EMPTY_STATE,
	isFiltered,
	isRangeActive,
	parseFilterState,
	slugifyValue,
	toPredicate,
	toQueryString,
	UNFILTERED_RANGE,
	type FilterState
} from './state.js';

const dataset = createDataset(
	makeSnapshot([
		makeCard({
			slug: 'red-unit',
			color: 'Red',
			cardType: 'Unit',
			cost: 3,
			power: 4,
			ramRequired: 2,
			classifications: ['Arasaka', 'Tyger Claws'],
			keywords: ['Blocker'],
			printings: [makePrinting({ setId: 'MS01-WNC', rarity: 'Common' })]
		}),
		makeCard({
			slug: 'blue-program',
			color: 'Blue',
			cardType: 'Program',
			cost: 1,
			power: null,
			ramRequired: 1,
			classifications: ['Quickhack'],
			printings: [makePrinting({ setId: 'SD01-HEI', rarity: 'Iconic Legend' })]
		}),
		makeCard({
			slug: 'red-legend',
			color: 'Red',
			cardType: 'Legend',
			cost: null,
			power: null,
			ramRequired: null,
			ramProvided: 2,
			printings: [makePrinting({ setId: 'MS01-WNC', rarity: 'Epic' })]
		})
	])
);

const parse = (query: string) => parseFilterState(new URLSearchParams(query), dataset);
const roundTrip = (query: string) => toQueryString(parse(query));
const matches = (state: FilterState) =>
	evaluate(dataset, toPredicate(dataset, state)).map((match) => match.card.slug);

describe('slugifyValue', () => {
	it.each([
		['Iconic Legend', 'iconic-legend'],
		['Tyger Claws', 'tyger-claws'],
		['6th Street', '6th-street'],
		["Maine's Crew", 'maine-s-crew'],
		['MS01-WNC', 'ms01-wnc']
	])('turns %s into %s', (value, expected) => {
		expect(slugifyValue(value)).toBe(expected);
	});
});

describe('parseFilterState', () => {
	it('reads an empty query as no filters', () => {
		expect(parse('')).toEqual(EMPTY_STATE);
	});

	it('reads comma-joined multi-select', () => {
		expect(parse('color=red,blue&type=unit')).toMatchObject({
			colors: ['Red', 'Blue'],
			cardTypes: ['Unit']
		});
	});

	it('drops an unknown facet value rather than throwing', () => {
		// A mangled shared link should degrade to a wider result set, not an error page.
		expect(parse('color=red,chartreuse').colors).toEqual(['Red']);
	});

	it('drops an unknown classification, whose vocabulary comes from the data', () => {
		expect(parse('tags=arasaka,nonesuch').classifications).toEqual(['Arasaka']);
	});

	it('drops an unknown set id', () => {
		expect(parse('set=ms01-wnc,season2').setIds).toEqual(['MS01-WNC']);
	});

	it('deduplicates repeated values', () => {
		expect(parse('color=red,red').colors).toEqual(['Red']);
	});

	it('ignores a repeated param instead of failing open', () => {
		// The idiomatic HTML-form encoding for multi-select; only the first param is read.
		expect(parse('color=red&color=blue').colors).toEqual(['Red']);
	});
});

describe('numeric range encoding', () => {
	it('reads explicit bounds and excludes nulls', () => {
		expect(parse('cost=2-4').cost).toEqual({ min: 2, max: 4, includeNull: false });
	});

	it('reads a half-open range', () => {
		expect(parse('power=-4').power).toEqual({ min: null, max: 4, includeNull: false });
		expect(parse('power=2-').power).toEqual({ min: 2, max: null, includeNull: false });
	});

	it('reads the + none token', () => {
		expect(parse('cost=2-4,none').cost).toEqual({ min: 2, max: 4, includeNull: true });
	});

	it('reads `has` as unbounded but null-excluding', () => {
		expect(parse('power=has').power).toEqual({ min: null, max: null, includeNull: false });
	});

	it('canonicalises an exact value to a degenerate range', () => {
		expect(parse('cost=3').cost).toEqual({ min: 3, max: 3, includeNull: false });
		expect(roundTrip('cost=3')).toBe('cost=3-3');
	});

	it('drops a malformed range', () => {
		expect(parse('cost=high').cost).toEqual(UNFILTERED_RANGE);
		expect(parse('cost=4-2').cost).toEqual(UNFILTERED_RANGE);
	});

	it('treats an unbounded range admitting nulls as no filter at all', () => {
		expect(isRangeActive(UNFILTERED_RANGE)).toBe(false);
		expect(toQueryString({ ...EMPTY_STATE, cost: UNFILTERED_RANGE })).toBe('');
	});
});

describe('sort encoding', () => {
	it('reads a key and direction', () => {
		expect(parse('sort=cost-desc').sort).toEqual({ key: 'cost', direction: 'desc' });
	});

	it('defaults direction to ascending', () => {
		expect(parse('sort=name').sort).toEqual({ key: 'name', direction: 'asc' });
	});

	it('falls back to the default sort on nonsense', () => {
		expect(parse('sort=vibes-sideways').sort).toEqual({ key: 'default', direction: 'asc' });
	});

	it('omits the default sort from the URL', () => {
		expect(roundTrip('sort=default-asc')).toBe('');
	});
});

describe('legend color slots', () => {
	it('reads up to three colors and canonicalises their order', () => {
		expect(parse('legends=red,blue,red').legendColors).toEqual(['Blue', 'Red', 'Red']);
	});

	it('ignores a fourth slot rather than rejecting the link', () => {
		expect(parse('legends=red,red,red,red').legendColors).toHaveLength(3);
	});

	it('round-trips to a sorted list', () => {
		expect(roundTrip('legends=red,blue,red')).toBe('legends=blue,red,red');
	});
});

describe('round-tripping', () => {
	it.each([
		'',
		'color=blue,red',
		'cost=2-4',
		'cost=2-4,none',
		'eddiable=true',
		'keywords=blocker&type=unit',
		'legends=blue,red,red',
		'power=has',
		'rarity=iconic-legend',
		'search=trash',
		'set=ms01-wnc',
		'sort=power-desc',
		'tags=arasaka,tyger-claws'
	])('params → state → params is stable for %s', (query) => {
		expect(roundTrip(query)).toBe(query);
	});

	it('is stable over a full combination', () => {
		const query =
			'color=blue,red&cost=2-4,none&eddiable=false&keywords=blocker&legends=red,red&power=has&rarity=common&search=trash&set=ms01-wnc&sort=cost-desc&tags=arasaka&type=unit&ram=1-3';
		expect(roundTrip(roundTrip(query))).toBe(roundTrip(query));
	});

	it('emits params in a stable order, so one state is one URL', () => {
		expect(toQueryString(parse('type=unit&color=red'))).toBe('color=red&type=unit');
	});
});

describe('isFiltered', () => {
	it('is false for the bare URL', () => {
		expect(isFiltered(EMPTY_STATE)).toBe(false);
	});

	it('is false when only the sort is set, which is not a filter', () => {
		expect(isFiltered(parse('sort=cost-desc'))).toBe(false);
	});

	it('is true as soon as any facet is engaged', () => {
		expect(isFiltered(parse('color=red'))).toBe(true);
		expect(isFiltered(parse('search=trash'))).toBe(true);
	});
});

describe('toPredicate', () => {
	it('matches everything for the bare URL', () => {
		expect(matches(EMPTY_STATE)).toHaveLength(3);
	});

	it('ANDs facets and ORs within them', () => {
		expect(matches(parse('color=red&type=unit,legend'))).toEqual(['red-unit', 'red-legend']);
	});

	it('applies the colored RAM budget', () => {
		// Red 4 admits the Red Unit (needs 2) and on-color Legends; Blue has no budget.
		expect(matches(parse('legends=red,red'))).toEqual(['red-unit', 'red-legend']);
	});

	it('excludes a color with no budget, Legends included', () => {
		expect(matches(parse('legends=blue'))).toEqual(['blue-program']);
	});

	it('reaches a rarity that exists only on a non-default printing', () => {
		expect(matches(parse('rarity=iconic-legend'))).toEqual(['blue-program']);
	});

	it('keeps 43-cards-worth of nulls out of a power range unless + none is set', () => {
		expect(matches(parse('power=0-15'))).toEqual(['red-unit']);
		expect(matches(parse('power=0-15,none'))).toHaveLength(3);
	});

	it('degrades a mangled link to a wider result set', () => {
		expect(matches(parse('color=chartreuse&cost=banana'))).toHaveLength(3);
	});
});
