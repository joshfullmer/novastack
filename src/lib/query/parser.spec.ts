/**
 * Spec §2: precedence, negation, grouping, and the chained-range production, at the AST level —
 * before any field semantics are resolved (that's compile.spec.ts).
 */
import { describe, expect, it } from 'vitest';
import { parse } from './parser.ts';

describe('parse — connectives and precedence', () => {
	it('parses a single bare word', () => {
		const { node, warnings } = parse('blocker');
		expect(warnings).toEqual([]);
		expect(node).toMatchObject({ type: 'field', field: 'text' });
	});

	it('parses implicit AND of two bare words', () => {
		const { node, warnings } = parse('night city');
		expect(warnings).toEqual([]);
		expect(node).toMatchObject({
			type: 'and',
			children: [
				{ type: 'field', field: 'text' },
				{ type: 'field', field: 'text' }
			]
		});
	});

	it('treats "and" as a no-op synonym for juxtaposition', () => {
		const { node } = parse('a and b');
		expect(node).toMatchObject({ type: 'and', children: [{}, {}] });
	});

	it('is case-insensitive for the "or" keyword', () => {
		const { node } = parse('a OR b');
		expect(node).toMatchObject({ type: 'or' });
	});

	it('parses "a or b c" as "a or (b c)", not "(a or b) c"', () => {
		const { node } = parse('a or b c');
		expect(node).toMatchObject({
			type: 'or',
			children: [
				{ type: 'field', field: 'text', value: { text: 'a' } },
				{
					type: 'and',
					children: [
						{ type: 'field', field: 'text', value: { text: 'b' } },
						{ type: 'field', field: 'text', value: { text: 'c' } }
					]
				}
			]
		});
	});

	it('binds parens tighter than everything', () => {
		const { node } = parse('(a or b) c');
		expect(node).toMatchObject({
			type: 'and',
			children: [
				{ type: 'or', children: [{}, {}] },
				{ type: 'field', field: 'text', value: { text: 'c' } }
			]
		});
	});

	it('binds "-" to a single atom', () => {
		const { node } = parse('-t:legend c:red');
		expect(node).toMatchObject({
			type: 'and',
			children: [
				{ type: 'not', child: { type: 'field', field: 'cardType' } },
				{ type: 'field', field: 'color' }
			]
		});
	});

	it('binds "-" to a parenthesised group', () => {
		const { node } = parse('-(t:legend or c:red)');
		expect(node).toMatchObject({
			type: 'not',
			child: {
				type: 'or',
				children: [
					{ type: 'field', field: 'cardType' },
					{ type: 'field', field: 'color' }
				]
			}
		});
	});

	it('requires quoting to search for the literal word "or"', () => {
		const { node } = parse('"or"');
		expect(node).toMatchObject({
			type: 'field',
			field: 'text',
			value: { type: 'string', text: 'or' }
		});
	});
});

describe('parse — field clauses', () => {
	it('parses a field clause', () => {
		const { node } = parse('cost:3');
		expect(node).toMatchObject({
			type: 'field',
			field: 'cost',
			operator: ':',
			value: { type: 'word', text: '3' }
		});
	});

	it('accepts a field alias', () => {
		const { node } = parse('c:red');
		expect(node).toMatchObject({ type: 'field', field: 'color' });
	});

	it('is case-insensitive for field names', () => {
		const { node } = parse('COST:3');
		expect(node).toMatchObject({ field: 'cost' });
	});

	it('falls back to bare text for a word not followed by an operator', () => {
		const { node } = parse('cost banana');
		expect(node).toMatchObject({
			type: 'and',
			children: [
				{ field: 'text', value: { text: 'cost' } },
				{ field: 'text', value: { text: 'banana' } }
			]
		});
	});

	it('accepts a quoted value', () => {
		const { node } = parse('tag:"Tyger Claws"');
		expect(node).toMatchObject({ field: 'tag', value: { type: 'string', text: 'Tyger Claws' } });
	});

	it('accepts a regex value', () => {
		const { node } = parse('rules:/bloc+ker/');
		expect(node).toMatchObject({ field: 'rules', value: { type: 'regex', pattern: 'bloc+ker' } });
	});
});

describe('parse — the chained-range production', () => {
	it('parses "1<=ram<=3" as one field node with a chain, mirroring the leading operator', () => {
		const { node, warnings } = parse('1<=ram<=3');
		expect(warnings).toEqual([]);
		expect(node).toMatchObject({
			type: 'field',
			field: 'ram',
			operator: '>=',
			value: { text: '1' },
			chain: { operator: '<=', value: { text: '3' } }
		});
	});

	it('rejects a direction mismatch as malformed rather than silently misreading it', () => {
		const { node, warnings } = parse('1<=ram>=3');
		expect(node).toBeNull();
		expect(warnings).toMatchObject([{ reason: 'malformed-value' }]);
	});

	it('does not misfire on an unrelated leading number', () => {
		// No comparable field named "cats" exists, so this is not the chained-range shape at all.
		const { node, warnings } = parse('9 cats');
		expect(warnings).toEqual([]);
		expect(node).toMatchObject({
			type: 'and',
			children: [
				{ field: 'text', value: { text: '9' } },
				{ field: 'text', value: { text: 'cats' } }
			]
		});
	});
});

describe('parse — error recovery', () => {
	it('drops an unclosed group as one unit, keeping what came before it', () => {
		const { node, warnings } = parse('t:legend (c:red or');
		expect(node).toMatchObject({ type: 'field', field: 'cardType' });
		expect(warnings).toMatchObject([{ reason: 'unclosed-group' }]);
	});

	it('degrades to null when nothing survives', () => {
		const { node, warnings } = parse('(c:red or');
		expect(node).toBeNull();
		expect(warnings).toMatchObject([{ reason: 'unclosed-group' }]);
	});
});
