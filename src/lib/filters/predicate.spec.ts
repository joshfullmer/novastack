import { describe, expect, it } from 'vitest';
import { createDataset } from '#lib/cards/dataset.js';
import { makeCard, makePrinting, makeSnapshot } from '#lib/cards/fixtures.js';
import type { Card } from '#lib/cards/schema.js';
import { admits, budgetFromLegendColors, EMPTY_BUDGET, isEmptyBudget } from './budget.js';
import { and, evaluate, type Predicate } from './predicate.js';

const datasetOf = (cards: readonly Card[]) => createDataset(makeSnapshot(cards));
const slugs = (cards: readonly Card[], tree: Predicate) =>
	evaluate(datasetOf(cards), tree).map((match) => match.card.slug);

describe('evaluate — facet semantics', () => {
	const cards = [
		makeCard({ slug: 'red-unit', color: 'Red', cardType: 'Unit' }),
		makeCard({ slug: 'blue-unit', color: 'Blue', cardType: 'Unit' }),
		makeCard({ slug: 'blue-gear', color: 'Blue', cardType: 'Gear' })
	];

	it('matches everything with an inactive tree', () => {
		expect(slugs(cards, { kind: 'all' })).toEqual(['red-unit', 'blue-unit', 'blue-gear']);
	});

	it('ORs within a facet', () => {
		expect(slugs(cards, { kind: 'color', values: ['Red', 'Blue'] })).toHaveLength(3);
	});

	it('ANDs across facets', () => {
		const tree = and([
			{ kind: 'color', values: ['Blue'] },
			{ kind: 'cardType', values: ['Gear'] }
		]);
		expect(slugs(cards, tree)).toEqual(['blue-gear']);
	});

	it('supports negation, for the query language that will target this evaluator', () => {
		const tree: Predicate = { kind: 'not', child: { kind: 'color', values: ['Blue'] } };
		expect(slugs(cards, tree)).toEqual(['red-unit']);
	});

	it('returns nothing when nothing matches', () => {
		expect(slugs(cards, { kind: 'color', values: ['Green'] })).toEqual([]);
	});
});

describe('evaluate — keywords and classifications', () => {
	const cards = [
		makeCard({ slug: 'blocker', keywords: ['Blocker'], classifications: ['Arasaka', 'Corpo'] }),
		makeCard({ slug: 'quick', keywords: ['Quick'], classifications: ['Merc'] }),
		makeCard({ slug: 'plain', keywords: [], classifications: [] })
	];

	it('matches a card carrying any of the selected keywords', () => {
		expect(slugs(cards, { kind: 'keyword', values: ['Blocker', 'Quick'] })).toEqual([
			'blocker',
			'quick'
		]);
	});

	it('matches a card carrying any of the selected classifications', () => {
		expect(slugs(cards, { kind: 'classification', values: ['Corpo'] })).toEqual(['blocker']);
	});

	it('never matches the fixture with no keywords and no classifications', () => {
		expect(slugs(cards, { kind: 'classification', values: ['Merc', 'Corpo'] })).not.toContain(
			'plain'
		);
	});
});

describe('evaluate — nulls are a bucket, never zero', () => {
	const cards = [
		makeCard({ slug: 'power-0', power: 0 }),
		makeCard({ slug: 'power-4', power: 4 }),
		makeCard({ slug: 'power-null', power: null })
	];

	it('excludes null from a bounded range', () => {
		expect(
			slugs(cards, { kind: 'numeric', field: 'power', min: 0, max: 15, includeNull: false })
		).toEqual(['power-0', 'power-4']);
	});

	it('never lets a bound reach null, even an unbounded one', () => {
		// The trap this rule exists for: `power ≥ 0` looks like "everything" and silently drops
		// every Program in the real dataset.
		expect(
			slugs(cards, { kind: 'numeric', field: 'power', min: null, max: null, includeNull: false })
		).toEqual(['power-0', 'power-4']);
	});

	it('admits null only through the explicit + none toggle', () => {
		expect(
			slugs(cards, { kind: 'numeric', field: 'power', min: 1, max: 15, includeNull: true })
		).toEqual(['power-4', 'power-null']);
	});

	it('keeps 0 distinct from null', () => {
		expect(
			slugs(cards, { kind: 'numeric', field: 'power', min: 0, max: 0, includeNull: false })
		).toEqual(['power-0']);
	});

	it('can select the null bucket alone', () => {
		expect(
			slugs(cards, { kind: 'numeric', field: 'power', min: 1, max: 0, includeNull: true })
		).toEqual(['power-null']);
	});

	it('reads the RAM facet from ramRequired, so a Legend falls in the none bucket', () => {
		const withLegend = [
			makeCard({ slug: 'unit', cardType: 'Unit', ramRequired: 2, ramProvided: null }),
			makeCard({ slug: 'legend', cardType: 'Legend', ramRequired: null, ramProvided: 2 })
		];
		expect(
			slugs(withLegend, { kind: 'numeric', field: 'ram', min: 1, max: 6, includeNull: false })
		).toEqual(['unit']);
		expect(
			slugs(withLegend, { kind: 'numeric', field: 'ram', min: 1, max: 6, includeNull: true })
		).toEqual(['unit', 'legend']);
	});
});

describe('evaluate — text search', () => {
	const cards = [
		makeCard({
			slug: 'v-streetkid',
			name: 'V — StreetKid',
			rulesText: [[{ kind: 'text', text: 'Trash 3 cards.' }]]
		}),
		makeCard({
			slug: 'judy',
			name: 'Judy Álvarez — Braindance Maestro',
			rulesText: [],
			flavorText: 'Night City never sleeps.',
			rawRulesText: '[Flavour] Night City never sleeps.'
		})
	];

	it('reaches across an em dash', () => {
		expect(slugs(cards, { kind: 'text', query: 'v streetkid' })).toEqual(['v-streetkid']);
	});

	it('ignores accents', () => {
		expect(slugs(cards, { kind: 'text', query: 'alvarez' })).toEqual(['judy']);
	});

	it('is case-insensitive and matches substrings of rules text', () => {
		expect(slugs(cards, { kind: 'text', query: 'TRASH' })).toEqual(['v-streetkid']);
	});

	it('does not search flavour text, so prose cannot masquerade as a game effect', () => {
		expect(slugs(cards, { kind: 'text', query: 'night city' })).toEqual([]);
	});
});

describe('evaluate — printing-level facets and witness selection', () => {
	const card = makeCard({
		slug: 'v-streetkid',
		printings: [
			makePrinting({ id: 'retail', setId: 'MS01-WNC', collectorNumber: '005a', rarity: 'Rare' }),
			makePrinting({
				id: 'iconic',
				setId: 'MS01-WNC',
				collectorNumber: 'β144',
				rarity: 'Iconic Legend'
			}),
			makePrinting({ id: 'boxtopper', setId: 'PRM-WNC', collectorNumber: '001', rarity: 'Epic' })
		]
	});
	const dataset = datasetOf([card]);

	it('shows the Default Printing when it qualifies', () => {
		const [match] = evaluate(dataset, { kind: 'all' });
		expect(match.printing.id).toBe('retail');
	});

	it('shows the printing that matched when the default does not qualify', () => {
		// This is what makes the rarities that exist only on non-default printings reachable.
		const [match] = evaluate(dataset, { kind: 'rarity', values: ['Iconic Legend'] });
		expect(match.printing.id).toBe('iconic');
	});

	it('lists the card once, not once per matching printing', () => {
		expect(evaluate(dataset, { kind: 'set', values: ['MS01-WNC'] })).toHaveLength(1);
	});

	it('requires Set and Rarity to hold on the same printing', () => {
		const tree = and([
			{ kind: 'set', values: ['PRM-WNC'] },
			{ kind: 'rarity', values: ['Iconic Legend'] }
		]);
		// The Iconic printing is in MS01-WNC and the box topper is Epic — no single printing is both.
		expect(evaluate(dataset, tree)).toEqual([]);
	});

	it('combines a card-level and a printing-level facet', () => {
		const tree = and([
			{ kind: 'color', values: ['Red'] },
			{ kind: 'set', values: ['PRM-WNC'] }
		]);
		const [match] = evaluate(dataset, tree);
		expect(match.printing.id).toBe('boxtopper');
	});
});

describe('admits — the coloured RAM budget', () => {
	const budget = budgetFromLegendColors(['Red', 'Red', 'Blue'], 2);

	it('sums RAM per colour from the slots', () => {
		expect(budget).toEqual({ Red: 4, Blue: 2, Green: 0, Yellow: 0 });
	});

	it('admits a card whose requirement clears the threshold', () => {
		expect(admits(budget, makeCard({ color: 'Red', ramRequired: 4 }))).toBe(true);
	});

	it('rejects a card whose requirement exceeds the threshold', () => {
		expect(admits(budget, makeCard({ color: 'Blue', ramRequired: 3 }))).toBe(false);
	});

	it('excludes an off-colour card entirely', () => {
		expect(admits(budget, makeCard({ color: 'Green', ramRequired: 1 }))).toBe(false);
	});

	it('keeps on-colour Legends, because the slots declare colours rather than cards', () => {
		const legend = makeCard({
			color: 'Red',
			cardType: 'Legend',
			ramRequired: null,
			ramProvided: 2
		});
		expect(admits(budget, legend)).toBe(true);
	});

	it('excludes an off-colour Legend, budget or not', () => {
		const legend = makeCard({
			color: 'Green',
			cardType: 'Legend',
			ramRequired: null,
			ramProvided: 2
		});
		expect(admits(budget, legend)).toBe(false);
	});

	it('treats a null requirement as 0 rather than as unsatisfiable', () => {
		expect(admits(budget, makeCard({ color: 'Blue', cardType: 'Gear', ramRequired: null }))).toBe(
			true
		);
	});

	it('admits nothing on an empty budget', () => {
		expect(admits(EMPTY_BUDGET, makeCard({ color: 'Red', ramRequired: 1 }))).toBe(false);
		expect(isEmptyBudget(EMPTY_BUDGET)).toBe(true);
	});

	it('is a threshold, not a budget — one card does not consume it', () => {
		const card = makeCard({ color: 'Red', ramRequired: 4 });
		expect(admits(budget, card) && admits(budget, card)).toBe(true);
	});
});

describe('and', () => {
	it('collapses to `all` when every control is inactive', () => {
		expect(and([{ kind: 'all' }, { kind: 'all' }])).toEqual({ kind: 'all' });
	});

	it('unwraps a single active control rather than nesting it', () => {
		expect(and([{ kind: 'all' }, { kind: 'color', values: ['Red'] }])).toEqual({
			kind: 'color',
			values: ['Red']
		});
	});
});
