import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '#lib/query/examples.js';
import { highlightQuery, type HighlightCategory } from './highlight.js';

function categoriesFor(source: string): Array<[string, HighlightCategory]> {
	return highlightQuery(source).map((s) => [source.slice(...s.span), s.category]);
}

describe('highlightQuery', () => {
	it('produces sorted, non-overlapping spans for every worked example on the Syntax page', () => {
		for (const { query } of EXAMPLES) {
			const spans = highlightQuery(query);
			for (let i = 1; i < spans.length; i++) {
				expect(spans[i].span[0]).toBeGreaterThanOrEqual(spans[i - 1].span[1]);
			}
			for (const { span } of spans) {
				expect(span[0]).toBeGreaterThanOrEqual(0);
				expect(span[1]).toBeLessThanOrEqual(query.length);
			}
		}
	});

	it('a bare word is a single value span covering the whole word', () => {
		expect(categoriesFor('blocker')).toEqual([['blocker', 'value']]);
	});

	it('a recognized field alias is its own span, distinct from the operator and value', () => {
		expect(categoriesFor('c:red')).toEqual([
			['c', 'field'],
			[':', 'operator'],
			['red', 'value']
		]);
	});

	it('an unrecognized field drops the whole clause, matching the parser — no spans at all', () => {
		expect(categoriesFor('frobnicate:x')).toEqual([]);
	});

	it('implicit AND produces no keyword span between two clauses', () => {
		const cats = categoriesFor('t:legend c:red');
		expect(cats.filter(([, category]) => category === 'keyword')).toEqual([]);
		expect(cats).toEqual([
			['t', 'field'],
			[':', 'operator'],
			['legend', 'value'],
			['c', 'field'],
			[':', 'operator'],
			['red', 'value']
		]);
	});

	it('the `or` connective is highlighted as a keyword between its two clauses', () => {
		const cats = categoriesFor('t:legend or c:red');
		expect(cats).toEqual([
			['t', 'field'],
			[':', 'operator'],
			['legend', 'value'],
			['or', 'keyword'],
			['c', 'field'],
			[':', 'operator'],
			['red', 'value']
		]);
	});

	it('negation highlights the minus itself as a keyword, distinct from the clause it negates', () => {
		expect(categoriesFor('-kw:blocker')).toEqual([
			['-', 'keyword'],
			['kw', 'field'],
			[':', 'operator'],
			['blocker', 'value']
		]);
	});

	it('parens are their own spans, peeled from the grouped content', () => {
		const cats = categoriesFor('(t:legend or c:red) -kw:blocker');
		expect(cats[0]).toEqual(['(', 'operator']);
		expect(cats.some(([text]) => text === ')')).toBe(true);
		expect(cats.some(([text, category]) => text === 'or' && category === 'keyword')).toBe(true);
		expect(cats.some(([text, category]) => text === '-' && category === 'keyword')).toBe(true);
	});

	it('a comparison operator on a numeric field highlights like any other operator', () => {
		expect(categoriesFor('cost>=3')).toEqual([
			['cost', 'field'],
			['>=', 'operator'],
			['3', 'value']
		]);
	});

	it('the chained-interval sugar highlights both bounds, both operators, and the field in the middle', () => {
		expect(categoriesFor('1<=ram<=3')).toEqual([
			['1', 'value'],
			['<=', 'operator'],
			['ram', 'field'],
			['<=', 'operator'],
			['3', 'value']
		]);
	});

	it('a quoted multi-word value is a single value span, quotes included — the overlay must color every character', () => {
		expect(categoriesFor('tag:"Tyger Claws"')).toEqual([
			['tag', 'field'],
			[':', 'operator'],
			['"Tyger Claws"', 'value']
		]);
	});

	it('a bare regex literal is its own category, distinct from a plain value', () => {
		expect(categoriesFor('/bloc+ker/')).toEqual([['/bloc+ker/', 'regex']]);
	});

	it('a field-scoped regex value is still categorized as regex, not value', () => {
		expect(categoriesFor('name:/^v/')).toEqual([
			['name', 'field'],
			[':', 'operator'],
			['/^v/', 'regex']
		]);
	});

	it('an unclosed group drops to no spans at all, matching the parser dropping the whole clause', () => {
		expect(highlightQuery('(t:legend')).toEqual([]);
	});

	it('a color field value is plain, like any other value — no Colour tinting', () => {
		expect(categoriesFor('color:red')).toEqual([
			['color', 'field'],
			[':', 'operator'],
			['red', 'value']
		]);
	});

	it('a legends: value is plain, like any other value — no per-letter tinting', () => {
		expect(categoriesFor('legends:rryyyy')).toEqual([
			['legends', 'field'],
			[':', 'operator'],
			['rryyyy', 'value']
		]);
	});
});
