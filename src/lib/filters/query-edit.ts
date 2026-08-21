/**
 * Chip write-back: given the current `?q=` source text, replace exactly one facet's
 * contribution and leave everything else — including any read-only text a chip can't touch —
 * untouched. This is what keeps chips → query losslessly guaranteed (spec §9): an edit only
 * ever rewrites the span(s) that were unambiguously *that* facet's, never anything else.
 *
 * Span-based, not predicate-based: `compileNode` on each top-level AST child (individually,
 * outside the merge/flatten normalisation `compileQuery` does for the whole tree) tells us
 * which child, if any, is the sole source of a given facet — exactly the same "one plain leaf,
 * no enclosing or/not" test spec §9 and `chips.ts` use, just applied per-child so each match
 * carries its own source span.
 */
import type { Dataset } from '#lib/cards/dataset.js';
import { quoteQueryValue } from '#lib/cards/dataset.js';
import type { CardType, Color, Keyword, Rarity } from '#lib/cards/vocabulary.js';
import { budgetFromLegendColors } from './budget.js';
import type { NumericRange } from './chips.js';
import type { Predicate } from './predicate.js';
import { compileField, type CompileContext } from '#lib/query/compile.js';
import { formatLegendsValue } from '#lib/query/legends-value.js';
import { parse, type FieldNode, type Node } from '#lib/query/parser.js';

export type FacetEdit =
	| { facet: 'color'; values: readonly Color[] }
	| { facet: 'cardType'; values: readonly CardType[] }
	| { facet: 'keyword'; values: readonly Keyword[] }
	| { facet: 'tag'; values: readonly string[] }
	| { facet: 'rarity'; values: readonly Rarity[] }
	| { facet: 'set'; values: readonly string[] }
	| { facet: 'eddiable'; value: boolean | null }
	| { facet: 'cost' | 'power' | 'ram'; range: NumericRange }
	| { facet: 'legends'; colors: readonly Color[] };

type FacetTarget =
	| {
			kind:
				| 'color'
				| 'cardType'
				| 'keyword'
				| 'classification'
				| 'set'
				| 'rarity'
				| 'eddiable'
				| 'ramBudget';
	  }
	| { kind: 'numeric'; field: 'cost' | 'power' | 'ram' };

function orGroup(field: string, values: readonly string[]): string | null {
	if (values.length === 0) return null;
	const clauses = values.map((value) => `${field}:${quoteQueryValue(value)}`);
	return clauses.length === 1 ? clauses[0] : `(${clauses.join(' or ')})`;
}

function rangeClause(field: string, range: NumericRange): string | null {
	const { min, max, includeNull } = range;
	if (min === null && max === null) return includeNull ? null : `${field}:has`;

	const bound =
		min !== null && max !== null
			? min === max
				? `${field}:${min}`
				: `${min}<=${field}<=${max}`
			: min !== null
				? `${field}>=${min}`
				: `${field}<=${max}`;
	return includeNull ? `(${bound}) or ${field}:none` : bound;
}

function clauseFor(edit: FacetEdit, dataset: Dataset): string | null {
	switch (edit.facet) {
		case 'color':
			return orGroup('color', edit.values);
		case 'cardType':
			return orGroup('type', edit.values);
		case 'keyword':
			return orGroup('keyword', edit.values);
		case 'tag':
			return orGroup('tag', edit.values);
		case 'rarity':
			return orGroup('rarity', edit.values);
		case 'set':
			return orGroup('set', edit.values);
		case 'eddiable':
			return edit.value === null ? null : `eddiable:${edit.value}`;
		case 'cost':
		case 'power':
		case 'ram':
			return rangeClause(edit.facet, edit.range);
		case 'legends': {
			if (edit.colors.length === 0) return null;
			const budget = budgetFromLegendColors(edit.colors, dataset.ramPerLegend);
			return `legends:${formatLegendsValue(budget)}`;
		}
	}
}

function targetFor(facet: FacetEdit['facet']): FacetTarget {
	switch (facet) {
		case 'color':
			return { kind: 'color' };
		case 'cardType':
			return { kind: 'cardType' };
		case 'keyword':
			return { kind: 'keyword' };
		case 'tag':
			return { kind: 'classification' };
		case 'rarity':
			return { kind: 'rarity' };
		case 'set':
			return { kind: 'set' };
		case 'eddiable':
			return { kind: 'eddiable' };
		case 'legends':
			return { kind: 'ramBudget' };
		case 'cost':
		case 'power':
		case 'ram':
			return { kind: 'numeric', field: facet };
	}
}

function matchesTarget(compiled: Predicate, target: FacetTarget): boolean {
	if (target.kind === 'numeric')
		return compiled.kind === 'numeric' && compiled.field === target.field;
	return compiled.kind === target.kind;
}

function astTopLevelChildren(node: Node | null): readonly Node[] {
	if (node === null) return [];
	return node.type === 'and' ? node.children : [node];
}

/** Applies one facet edit to `source`, returning the new query text. */
export function withFacetEdit(source: string, dataset: Dataset, edit: FacetEdit): string {
	const { node } = parse(source);
	const target = targetFor(edit.facet);
	const ctx: CompileContext = { dataset };

	const kept: string[] = [];
	for (const child of astTopLevelChildren(node)) {
		if (child.type === 'field' && matchesFieldTarget(child, ctx, target)) continue;
		kept.push(source.slice(child.span[0], child.span[1]));
	}

	const newClause = clauseFor(edit, dataset);
	const parts = newClause === null ? kept : [newClause, ...kept];
	return parts
		.map((part) => part.trim())
		.filter((part) => part !== '')
		.join(' ');
}

/** A representable facet's sole source is always a plain field clause — never a group, `or` or
 * `not` (those are exactly what makes a facet read-only) — so only `field` nodes are candidates. */
function matchesFieldTarget(node: FieldNode, ctx: CompileContext, target: FacetTarget): boolean {
	const compiled = compileField(node, ctx, []);
	return compiled !== null && matchesTarget(compiled, target);
}
