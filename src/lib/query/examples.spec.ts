/**
 * The Syntax page's anti-drift guarantee (spec §11): every worked example must still parse
 * cleanly against the real, current dataset — a documented query that quietly stops working
 * fails the build here, rather than going stale on the page.
 */
import { describe, expect, it } from 'vitest';
import { dataset } from '#lib/cards/index.js';
import { evaluate } from '#lib/filters/predicate.js';
import { EXAMPLES } from './examples.ts';
import { parseQuery } from './index.ts';

describe('every worked example on the Syntax page', () => {
	it.each(EXAMPLES)('parses cleanly: $query', ({ query }) => {
		const { warnings } = parseQuery(query, dataset);
		expect(warnings).toEqual([]);
	});

	it.each(EXAMPLES)('evaluates without throwing: $query', ({ query }) => {
		const { predicate } = parseQuery(query, dataset);
		expect(() => evaluate(dataset, predicate)).not.toThrow();
	});
});
