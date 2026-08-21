/**
 * Spec §8: reject known ReDoS shapes (nested/overlapping quantifiers) via a static check before
 * compiling, plus mandatory `try/catch` around `new RegExp` for outright invalid syntax.
 */
import { describe, expect, it } from 'vitest';
import { compileSafeRegex } from './regex-safety.ts';

describe('compileSafeRegex', () => {
	it('compiles an ordinary pattern', () => {
		const result = compileSafeRegex('blocker');
		expect(result.ok).toBe(true);
	});

	it('compiles a single quantified atom', () => {
		expect(compileSafeRegex('a+').ok).toBe(true);
		expect(compileSafeRegex('[a-z]+').ok).toBe(true);
		expect(compileSafeRegex('.*').ok).toBe(true);
	});

	it('compiles a quantified group with no internal quantifier', () => {
		expect(compileSafeRegex('(abc)+').ok).toBe(true);
		expect(compileSafeRegex('(foo|bar)+').ok).toBe(true);
	});

	it('compiles bounded brace quantifiers, including on a group', () => {
		expect(compileSafeRegex('\\d{2,4}').ok).toBe(true);
		expect(compileSafeRegex('(abc){3}').ok).toBe(true);
	});

	it('rejects the classic nested-quantifier nightmare', () => {
		const result = compileSafeRegex('(a+)+');
		expect(result).toEqual({ ok: false, reason: 'unsafe-pattern' });
	});

	it('rejects every nested-quantifier combination', () => {
		for (const pattern of ['(a+)+', '(a*)*', '(a+)*', '(a*)+', '([a-z]+)+', '(a+b+)+']) {
			expect(compileSafeRegex(pattern)).toEqual({ ok: false, reason: 'unsafe-pattern' });
		}
	});

	it('rejects overlapping alternation — identical branches under a repeating group', () => {
		expect(compileSafeRegex('(a|a)+')).toEqual({ ok: false, reason: 'unsafe-pattern' });
		expect(compileSafeRegex('(foo|foo|bar)*')).toEqual({ ok: false, reason: 'unsafe-pattern' });
	});

	it('does not flag distinct alternatives under a repeating group', () => {
		expect(compileSafeRegex('(foo|bar)+').ok).toBe(true);
	});

	it('does not flag identical alternatives without a repeating quantifier', () => {
		expect(compileSafeRegex('(a|a)').ok).toBe(true);
	});

	it('rejects nested quantifiers found deeper than the outermost group', () => {
		const result = compileSafeRegex('x(a(b+)+)y');
		expect(result).toEqual({ ok: false, reason: 'unsafe-pattern' });
	});

	it('does not flag a group quantified by a bounded exact count', () => {
		// (a+){3} still repeats a variable-length quantified atom a bounded 3 times — not the
		// unbounded-nesting shape this check exists for.
		expect(compileSafeRegex('(a+){3}').ok).toBe(true);
	});

	it('rejects invalid regex syntax without throwing', () => {
		const result = compileSafeRegex('(unclosed');
		expect(result).toEqual({ ok: false, reason: 'invalid-syntax' });
	});

	it('returns a working RegExp on success', () => {
		const result = compileSafeRegex('bloc+ker');
		if (!result.ok) throw new Error('expected ok');
		expect(result.regex.test('a blocker card')).toBe(true);
		expect(result.regex.test('nothing here')).toBe(false);
	});
});
