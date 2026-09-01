import { describe, expect, it } from 'vitest';
import { autocompleteFor } from './autocomplete.js';

describe('autocompleteFor', () => {
	it('suggests field names/aliases while typing a bare word at the start', () => {
		const state = autocompleteFor('c', 1);
		expect(state?.kind).toBe('field');
		expect(state?.span).toEqual([0, 1]);
		expect(state?.suggestions.map((s) => s.keyword)).toContain('c');
		expect(state?.suggestions.map((s) => s.keyword)).toContain('cost');
		expect(state?.suggestions.map((s) => s.keyword)).toContain('color');
	});

	it('an alias suggestion carries its canonical field as a hint; the canonical form does not', () => {
		const state = autocompleteFor('c', 1);
		const alias = state?.suggestions.find((s) => s.keyword === 'c');
		const canonical = state?.suggestions.find((s) => s.keyword === 'color');
		expect(alias?.hint).toBe('color');
		expect(canonical?.hint).toBeUndefined();
	});

	it('sorts alias suggestions ahead of canonical ones — shorthand is what a fluent user reaches for', () => {
		const state = autocompleteFor('c', 1);
		expect(state?.suggestions.map((s) => s.keyword)).toEqual(['c', 'color', 'cost']);
	});

	it('field suggestions insert the bare keyword — the colon is the caller’s job', () => {
		const state = autocompleteFor('cos', 3);
		const suggestion = state?.suggestions.find((s) => s.keyword === 'cost');
		expect(suggestion?.insertText).toBe('cost');
	});

	it('matches anywhere the caret sits inside the word, using only the prefix up to the caret', () => {
		// Caret after "co" in "cost" (typed further right, then moved back).
		const state = autocompleteFor('cost', 2);
		expect(state?.span).toEqual([0, 4]);
		expect(state?.suggestions.map((s) => s.keyword)).toContain('cost');
		expect(state?.suggestions.map((s) => s.keyword)).toContain('color');
	});

	it('suggests a recognized enum field’s values once its operator has been typed', () => {
		const state = autocompleteFor('color:re', 8);
		expect(state?.kind).toBe('value');
		expect(state?.span).toEqual([6, 8]);
		expect(state?.suggestions.map((s) => s.keyword)).toEqual(['red']);
	});

	it('matches an enum value by its slug, not just its literal display text', () => {
		const state = autocompleteFor('keyword:go-s', 12);
		expect(state?.suggestions.map((s) => s.keyword)).toEqual(['go solo']);
	});

	it('lowercases an enum value suggestion — thematic, matching field names being lowercase too', () => {
		const state = autocompleteFor('color:re', 8);
		expect(state?.suggestions.map((s) => s.keyword)).toEqual(['red']);
	});

	it('quotes a multi-word enum value on insertion, lowercased', () => {
		const state = autocompleteFor('keyword:go', 10);
		const suggestion = state?.suggestions.find((s) => s.keyword === 'go solo');
		expect(suggestion?.insertText).toBe('"go solo"');
	});

	it('offers no value suggestions for a field with no closed enum', () => {
		expect(autocompleteFor('cost:ba', 7)).toBeNull();
	});

	it('offers no value suggestions after an unrecognized field', () => {
		expect(autocompleteFor('frobnicate:re', 13)).toBeNull();
	});

	it('offers no suggestions with nothing typed yet', () => {
		expect(autocompleteFor('color:', 6)).toBeNull();
	});

	it('offers no suggestions when the caret sits in whitespace between clauses', () => {
		expect(autocompleteFor('t:legend ', 9)).toBeNull();
	});

	it('offers no suggestions once a value fully matches nothing (typo)', () => {
		expect(autocompleteFor('color:zz', 8)).toBeNull();
	});

	it('field suggestions still apply after a completed earlier clause and a space', () => {
		const state = autocompleteFor('t:legend c', 10);
		expect(state?.kind).toBe('field');
		expect(state?.suggestions.map((s) => s.keyword)).toContain('color');
	});

	it('field suggestions apply right after a negation prefix', () => {
		const state = autocompleteFor('-c', 2);
		expect(state?.kind).toBe('field');
		expect(state?.suggestions.map((s) => s.keyword)).toContain('color');
	});
});
