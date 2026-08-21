import { describe, expect, it } from 'vitest';
import { createDataset } from '#lib/cards/dataset.js';
import { makeCard, makeSnapshot } from '#lib/cards/fixtures.js';
import { evaluate } from './predicate.js';
import { EMPTY_QUERY_STATE, isFiltered, parseQueryState, PARAM, toQueryUrl } from './state.js';

const dataset = createDataset(
	makeSnapshot([
		makeCard({ slug: 'red-unit', color: 'Red', cardType: 'Unit' }),
		makeCard({ slug: 'blue-program', color: 'Blue', cardType: 'Program' })
	])
);

const parse = (query: string) => parseQueryState(new URLSearchParams(query), dataset);

describe('parseQueryState', () => {
	it('reads an empty query as no filter', () => {
		expect(parse('')).toEqual(EMPTY_QUERY_STATE);
	});

	it('reads ?q= into predicate and warnings', () => {
		const state = parse('q=color:red');
		expect(state.source).toBe('color:red');
		expect(evaluate(dataset, state.predicate).map((m) => m.card.slug)).toEqual(['red-unit']);
	});

	it('degrades a malformed query to no filter, with a warning', () => {
		const state = parse('q=color:chartreuse');
		expect(evaluate(dataset, state.predicate)).toHaveLength(2);
		expect(state.warnings.length).toBeGreaterThan(0);
	});

	it('ignores an old-style per-facet param entirely — no migration code needed', () => {
		const state = parse('color=red&cost=2-4');
		expect(state).toEqual(EMPTY_QUERY_STATE);
	});

	it('reads sort, unaffected by the query language', () => {
		expect(parse('sort=cost-desc').sort).toEqual({ key: 'cost', direction: 'desc' });
	});

	it('falls back to the default sort on nonsense', () => {
		expect(parse('sort=vibes-sideways').sort).toEqual({ key: 'default', direction: 'asc' });
	});
});

describe('toQueryUrl', () => {
	const here = { href: 'https://novastack.example/cards' };

	it('omits ?q= for an empty query', () => {
		expect(toQueryUrl(here, '', { key: 'default', direction: 'asc' }).search).toBe('');
	});

	it('encodes the query text', () => {
		const url = toQueryUrl(here, 'color:red type:legend', { key: 'default', direction: 'asc' });
		expect(url.searchParams.get(PARAM.query)).toBe('color:red type:legend');
	});

	it('omits the default sort', () => {
		const url = toQueryUrl(here, '', { key: 'default', direction: 'asc' });
		expect(url.searchParams.has(PARAM.sort)).toBe(false);
	});

	it('includes a non-default sort', () => {
		const url = toQueryUrl(here, '', { key: 'cost', direction: 'desc' });
		expect(url.searchParams.get(PARAM.sort)).toBe('cost-desc');
	});

	it('round-trips through parseQueryState', () => {
		const url = toQueryUrl(here, 'color:red', { key: 'cost', direction: 'desc' });
		const state = parseQueryState(url.searchParams, dataset);
		expect(state.source).toBe('color:red');
		expect(state.sort).toEqual({ key: 'cost', direction: 'desc' });
	});
});

describe('isFiltered', () => {
	it('is false for an empty query', () => {
		expect(isFiltered('')).toBe(false);
		expect(isFiltered('   ')).toBe(false);
	});

	it('is true for any non-empty query', () => {
		expect(isFiltered('color:red')).toBe(true);
	});
});
