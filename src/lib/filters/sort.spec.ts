import { describe, expect, it } from 'vitest';
import { createDataset } from '#lib/cards/dataset.js';
import { makeCard, makeSnapshot } from '#lib/cards/fixtures.js';
import type { Card } from '#lib/cards/schema.js';
import { evaluate } from './predicate.js';
import { compareCards, DEFAULT_SORT, sortMatches, type Sort } from './sort.js';

const dataset = (cards: readonly Card[]) => createDataset(makeSnapshot(cards));

const order = (cards: readonly Card[], sort: Sort) =>
	sortMatches(dataset(cards), evaluate(dataset(cards), { kind: 'all' }), sort).map(
		(match) => match.card.slug
	);

describe('the default sort', () => {
	it('groups by the derived color order, then the derived type order, then cost, then name', () => {
		const cards = [
			makeCard({ slug: 'blue-unit', color: 'Blue', cardType: 'Unit', cost: 1, name: 'Blue Unit' }),
			makeCard({ slug: 'red-unit-5', color: 'Red', cardType: 'Unit', cost: 5, name: 'Red Unit 5' }),
			makeCard({ slug: 'red-unit-2', color: 'Red', cardType: 'Unit', cost: 2, name: 'Red Unit 2' }),
			makeCard({
				slug: 'red-legend',
				color: 'Red',
				cardType: 'Legend',
				cost: 9,
				name: 'Red Legend'
			})
		];

		// Snapshot color order is Red → Yellow → Green → Blue; type order Legend → Unit → …
		expect(order(cards, DEFAULT_SORT)).toEqual([
			'red-legend',
			'red-unit-2',
			'red-unit-5',
			'blue-unit'
		]);
	});

	it('breaks a full tie on name', () => {
		const cards = [
			makeCard({ slug: 'zeta', name: 'Zeta', color: 'Red', cardType: 'Unit', cost: 3 }),
			makeCard({ slug: 'alpha', name: 'Alpha', color: 'Red', cardType: 'Unit', cost: 3 })
		];
		expect(order(cards, DEFAULT_SORT)).toEqual(['alpha', 'zeta']);
	});

	it('parks a null cost after every real cost within its block', () => {
		const cards = [
			makeCard({ slug: 'costless', color: 'Red', cardType: 'Legend', cost: null, name: 'A' }),
			makeCard({ slug: 'cost-9', color: 'Red', cardType: 'Legend', cost: 9, name: 'Z' })
		];
		expect(order(cards, DEFAULT_SORT)).toEqual(['cost-9', 'costless']);
	});
});

describe('selectable sorts', () => {
	const cards = [
		makeCard({ slug: 'p-null', power: null, name: 'A', color: 'Blue', cardType: 'Program' }),
		makeCard({ slug: 'p-8', power: 8, name: 'B', color: 'Red', cardType: 'Unit' }),
		makeCard({ slug: 'p-0', power: 0, name: 'C', color: 'Green', cardType: 'Unit' })
	];

	it('applies across the whole result set, ignoring the default grouping', () => {
		expect(order(cards, { key: 'power', direction: 'asc' })).toEqual(['p-0', 'p-8', 'p-null']);
	});

	it('keeps nulls last when descending too', () => {
		// One rule everywhere. Nulls are not "very small" or "very large" — they are absent.
		expect(order(cards, { key: 'power', direction: 'desc' })).toEqual(['p-8', 'p-0', 'p-null']);
	});

	it('sorts by name in both directions', () => {
		expect(order(cards, { key: 'name', direction: 'asc' })).toEqual(['p-null', 'p-8', 'p-0']);
		expect(order(cards, { key: 'name', direction: 'desc' })).toEqual(['p-0', 'p-8', 'p-null']);
	});

	it('sorts by cost with nulls last', () => {
		const costs = [
			makeCard({ slug: 'c-null', cost: null, name: 'A' }),
			makeCard({ slug: 'c-9', cost: 9, name: 'B' }),
			makeCard({ slug: 'c-1', cost: 1, name: 'C' })
		];
		expect(order(costs, { key: 'cost', direction: 'asc' })).toEqual(['c-1', 'c-9', 'c-null']);
	});
});

describe('sortMatches', () => {
	it('does not mutate its input', () => {
		const cards = [makeCard({ slug: 'b', name: 'B' }), makeCard({ slug: 'a', name: 'A' })];
		const built = dataset(cards);
		const matches = evaluate(built, { kind: 'all' });
		const before = matches.map((match) => match.card.slug);

		sortMatches(built, matches, { key: 'name', direction: 'asc' });
		expect(matches.map((match) => match.card.slug)).toEqual(before);
	});

	it('ranks an unknown color last rather than throwing', () => {
		const built = createDataset(
			makeSnapshot([makeCard({ slug: 'red', color: 'Red' })], { colorOrder: ['Blue'] })
		);
		expect(compareCards(built, DEFAULT_SORT)).toBeTypeOf('function');
	});
});
