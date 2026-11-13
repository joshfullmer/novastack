/**
 * `bookmarked:` — the one field that only exists in the deck editor (`FieldSpec.deckOnly`).
 *
 * Two halves: outside the editor it is not a field at all and degrades like any unknown keyword
 * (spec §6); inside, it is a boolean over a Card's slug that composes with everything else.
 */
import { describe, expect, it } from 'vitest';
import { createDataset } from '#lib/cards/dataset.js';
import { makeCard, makeSnapshot } from '#lib/cards/fixtures.js';
import { withFacetEdit } from '#lib/filters/query-edit.js';
import { evaluate, NOTHING_OWNED } from '#lib/filters/predicate.js';
import { parseQuery } from './index.ts';

const dataset = createDataset(
	makeSnapshot([
		makeCard({ slug: 'maybe', name: 'Maybe', color: 'Red', cost: 2 }),
		makeCard({ slug: 'maybe-not', name: 'Maybe Not', color: 'Red', cost: 5 }),
		makeCard({ slug: 'blue-maybe', name: 'Blue Maybe', color: 'Blue', cost: 2 })
	])
);

const bookmarked = new Set(['maybe', 'blue-maybe']);
const names = (source: string, options?: { deck?: boolean }) =>
	evaluate(dataset, parseQuery(source, dataset, options).predicate, NOTHING_OWNED, (slug) =>
		bookmarked.has(slug)
	)
		.map((match) => match.card.slug)
		.sort();

describe('bookmarked: outside the deck editor', () => {
	it('is an unknown field, dropped with a warning like any other', () => {
		const { predicate, warnings } = parseQuery('bookmarked:yes', dataset);
		expect(predicate).toEqual({ kind: 'all' });
		expect(warnings.map((warning) => warning.reason)).toEqual(['unknown-field']);
	});

	it('does not narrow the grid', () => {
		expect(names('bookmarked:yes')).toHaveLength(3);
	});
});

describe('bookmarked: in the deck editor', () => {
	const deck = { deck: true };

	it('compiles to a boolean leaf', () => {
		expect(parseQuery('bookmarked:yes', dataset, deck).predicate).toEqual({
			kind: 'bookmarked',
			value: true
		});
		expect(parseQuery('bookmarked:no', dataset, deck).predicate).toEqual({
			kind: 'bookmarked',
			value: false
		});
	});

	it('matches bookmarked cards only', () => {
		expect(names('bookmarked:yes', deck)).toEqual(['blue-maybe', 'maybe']);
		expect(names('bookmarked:no', deck)).toEqual(['maybe-not']);
		expect(names('-bookmarked:yes', deck)).toEqual(['maybe-not']);
	});

	it('composes with the rest of the language', () => {
		expect(names('bookmarked:yes color:Red', deck)).toEqual(['maybe']);
		expect(names('bookmarked:yes cost>=3', deck)).toEqual([]);
	});

	it('is nothing bookmarked until a lookup says otherwise', () => {
		const { predicate } = parseQuery('bookmarked:yes', dataset, deck);
		expect(evaluate(dataset, predicate)).toEqual([]);
	});

	it.each(['bookmarked:none', 'bookmarked:has', 'bookmarked>yes', 'bookmarked:maybe'])(
		'rejects %s rather than guessing',
		(source) => {
			const { predicate, warnings } = parseQuery(source, dataset, deck);
			expect(predicate).toEqual({ kind: 'all' });
			expect(warnings).not.toHaveLength(0);
		}
	);
});

describe('the bookmark chip writing back', () => {
	const deck = { deck: true };
	const edit = (source: string, value: boolean | null) =>
		withFacetEdit(source, dataset, { facet: 'bookmarked', value }, deck);

	it('adds the clause and keeps everything else as typed', () => {
		expect(edit('color:Red cost<=3', true)).toBe('bookmarked:yes color:Red cost<=3');
	});

	it('removes only its own clause', () => {
		expect(edit('bookmarked:yes color:Red', null)).toBe('color:Red');
	});

	it('replaces rather than duplicates', () => {
		expect(edit('bookmarked:yes color:Red', true)).toBe('bookmarked:yes color:Red');
	});
});
