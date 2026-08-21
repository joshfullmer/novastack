/**
 * AST → `Predicate` compilation (spec §3, §4, §6).
 *
 * Field semantics live here: is this value legal for this field, what does `none`/`has` mean,
 * is a regex pattern safe, and — the one piece of real logic — how negation splits between a
 * true logical complement (membership fields) and operator inversion (ordered comparisons,
 * spec §3.6), since Scryfall's own numeric negation sets no precedent to inherit.
 *
 * Every compile function returns `Predicate | null`; `null` means "this subtree was dropped",
 * and propagates upward through `and`/`or`/`not` exactly as spec §6 describes — the smallest
 * self-contained broken thing disappears, not everything after it. The public entry point
 * converts a fully-null result to `{ kind: 'all' }`, the same degrade-to-everything stage 1 was
 * already tested against.
 */
import {
	CARD_TYPES,
	CardTypeSchema,
	COLORS,
	ColorSchema,
	KEYWORDS,
	KeywordSchema,
	RARITY_ORDER,
	RaritySchema,
	type CardType,
	type Color,
	type Keyword,
	type Rarity
} from '#lib/cards/vocabulary.js';
import { slugLookup, type Dataset } from '#lib/cards/dataset.js';
import * as v from 'valibot';
import { and, type NumericField, type Predicate } from '#lib/filters/predicate.js';
import { parseLegendsValue } from './legends-value.ts';
import { compileSafeRegex } from './regex-safety.ts';
import type {
	CompareOp,
	FieldNode,
	Node,
	ParseWarning,
	ParseWarningReason,
	ValueNode
} from './parser.ts';
import { COMPARABLE_FIELDS } from './vocabulary.ts';

export type CompileContext = { dataset: Dataset };

/** Logical negation of a comparison (De Morgan) — a different mapping from `MIRROR` above:
 * `NOT(x >= 3)` is `x < 3`, not `x <= 3`. Direction *and* strictness both flip. */
const NEGATE: Readonly<Record<CompareOp, CompareOp>> = {
	'<': '>=',
	'<=': '>',
	'>': '<=',
	'>=': '<'
};

function valueText(value: ValueNode): string {
	return value.type === 'regex' ? value.pattern : value.text;
}

/** `none`/`has` are reserved only as a *bare* word (spec §2.1's grammar lists them as `Value`
 * alternatives distinct from `QuotedString`) — quoting is what escapes them, same as quoting
 * escapes `or`/`and` elsewhere in the grammar. `tag:"none"` must be able to search for a literal
 * tag spelled "none", not collapse onto the array-emptiness test. */
function isReservedWord(value: ValueNode, word: 'none' | 'has'): boolean {
	return value.type === 'word' && value.text.toLowerCase() === word;
}

export function compileQuery(
	node: Node | null,
	ctx: CompileContext
): { predicate: Predicate; warnings: ParseWarning[] } {
	const warnings: ParseWarning[] = [];
	const predicate = node === null ? null : compileNode(node, ctx, warnings);
	return { predicate: predicate ?? { kind: 'all' }, warnings };
}

function warn(
	warnings: ParseWarning[],
	node: { span: readonly [number, number] },
	reason: ParseWarningReason,
	sourceText: string
): void {
	warnings.push({ text: sourceText, span: node.span, reason });
}

export function compileNode(
	node: Node,
	ctx: CompileContext,
	warnings: ParseWarning[]
): Predicate | null {
	switch (node.type) {
		case 'and': {
			// Flattens a nested `and` — from a redundant parenthesised group, e.g.
			// `(c:red type:legend) tag:foo` — one level. AND is associative, so this changes
			// nothing semantically; it's also what keeps chip representability (spec §9) from
			// missing a facet that's only "hidden" behind a paren someone didn't need to type.
			const children = node.children
				.map((child) => compileNode(child, ctx, warnings))
				.filter((child): child is Predicate => child !== null)
				.flatMap((child) => (child.kind === 'and' ? child.children : [child]));
			return children.length === 0 ? null : and(children);
		}
		case 'or': {
			const children = node.children
				.map((child) => compileNode(child, ctx, warnings))
				.filter((child): child is Predicate => child !== null)
				.flatMap((child) => (child.kind === 'or' ? child.children : [child]));
			return children.length === 0 ? null : combineOr(children);
		}
		case 'not':
			return compileNegation(node.child, ctx, warnings);
		case 'field':
			return compileField(node, ctx, warnings);
	}
}

/**
 * OR-of-membership-tests over a value set is exactly membership-test-over-the-union, so a
 * same-kind OR collapses to one leaf — what lets chip multi-select (`c:red or c:blue`) match
 * the one-leaf shape spec §9's chip representability check expects.
 *
 * Six small functions rather than one generic one: each branches on `child.kind` inside its own
 * loop, which is what lets every return stay a genuinely-typed `Predicate` member with no cast —
 * a generic version can't correlate a runtime-checked `kind` with the value type TypeScript
 * would need to trust without one.
 */
function mergeColor(children: readonly Predicate[]): Predicate | null {
	const values: Color[] = [];
	for (const child of children) {
		if (child.kind !== 'color') return null;
		for (const value of child.values) if (!values.includes(value)) values.push(value);
	}
	return { kind: 'color', values };
}

function mergeCardType(children: readonly Predicate[]): Predicate | null {
	const values: CardType[] = [];
	for (const child of children) {
		if (child.kind !== 'cardType') return null;
		for (const value of child.values) if (!values.includes(value)) values.push(value);
	}
	return { kind: 'cardType', values };
}

function mergeKeyword(children: readonly Predicate[]): Predicate | null {
	const values: Keyword[] = [];
	for (const child of children) {
		if (child.kind !== 'keyword' || child.empty !== undefined) return null;
		for (const value of child.values) if (!values.includes(value)) values.push(value);
	}
	return { kind: 'keyword', values };
}

function mergeClassification(children: readonly Predicate[]): Predicate | null {
	const values: string[] = [];
	for (const child of children) {
		if (child.kind !== 'classification' || child.empty !== undefined) return null;
		for (const value of child.values) if (!values.includes(value)) values.push(value);
	}
	return { kind: 'classification', values };
}

function mergeSet(children: readonly Predicate[]): Predicate | null {
	const values: string[] = [];
	for (const child of children) {
		if (child.kind !== 'set') return null;
		for (const value of child.values) if (!values.includes(value)) values.push(value);
	}
	return { kind: 'set', values };
}

function mergeRarity(children: readonly Predicate[]): Predicate | null {
	const values: Rarity[] = [];
	for (const child of children) {
		if (child.kind !== 'rarity') return null;
		for (const value of child.values) if (!values.includes(value)) values.push(value);
	}
	return { kind: 'rarity', values };
}

/** The bound half of `(cost>=3) or cost:none` — the only shape `rangeClause` (query-edit.ts)
 * ever writes for "a bound, plus the null bucket" — is a genuine two-child `or` at the AST
 * level, since no single leaf can carry both a real bound and `includeNull`. `compileNumeric`'s
 * bare `none` compiles to the deliberately unreachable `min > max` marker (chips.ts's own
 * "the two-thumb slider can't isolate this" test), so recognising exactly that marker paired
 * with one real bound is what folds the pair back into the one `numeric` leaf `readNumeric`
 * needs to show the slider as interactive — without it, editing a range with nulls included
 * makes that facet permanently read-only after the first edit. */
function mergeNumeric(children: readonly Predicate[]): Predicate | null {
	if (children.length !== 2) return null;
	const [a, b] = children;
	if (a.kind !== 'numeric' || b.kind !== 'numeric' || a.field !== b.field) return null;

	const isNoneMarker = (p: Extract<Predicate, { kind: 'numeric' }>): boolean =>
		p.min !== null && p.max !== null && p.min > p.max && p.includeNull;
	const [marker, bound] = isNoneMarker(a) ? [a, b] : isNoneMarker(b) ? [b, a] : [null, null];
	if (marker === null || bound === null || bound.includeNull) return null;

	return { kind: 'numeric', field: bound.field, min: bound.min, max: bound.max, includeNull: true };
}

function combineOr(children: readonly Predicate[]): Predicate {
	if (children.length === 1) return children[0];

	const merged =
		mergeColor(children) ??
		mergeCardType(children) ??
		mergeKeyword(children) ??
		mergeClassification(children) ??
		mergeSet(children) ??
		mergeRarity(children) ??
		mergeNumeric(children);
	return merged ?? { kind: 'or', children };
}

/**
 * Spec §3.6: membership negation is the generic `not` node; ordered-comparison negation is
 * operator inversion, compiled directly into a fresh leaf so `includeNull` is never flipped by
 * accident. Only a comparable field (cost/power/ram/rarity) actually being used as a bound —
 * not `none`/`has`, which is a presence test, membership-shaped regardless of field — takes the
 * inversion path.
 */
function compileNegation(
	child: Node,
	ctx: CompileContext,
	warnings: ParseWarning[]
): Predicate | null {
	if (child.type === 'field' && isInvertibleBound(child)) {
		return compileInvertedBound(child, warnings);
	}
	const compiled = compileNode(child, ctx, warnings);
	return compiled === null ? null : { kind: 'not', child: compiled };
}

function isInvertibleBound(node: FieldNode): boolean {
	if (!COMPARABLE_FIELDS.includes(node.field)) return false;
	return !isReservedWord(node.value, 'none') && !isReservedWord(node.value, 'has');
}

export function compileField(
	node: FieldNode,
	ctx: CompileContext,
	warnings: ParseWarning[]
): Predicate | null {
	switch (node.field) {
		case 'color':
			return compileEnumMembership(node, warnings, 'color');
		case 'cardType':
			return compileEnumMembership(node, warnings, 'cardType');
		case 'keyword':
			return compileNullableEnum(node, warnings, KeywordSchema, KEYWORDS, 'keyword');
		case 'tag':
			return compileClassification(node, ctx, warnings);
		case 'set':
			return compileSet(node, ctx, warnings);
		case 'eddiable':
			return compileEddiable(node, warnings);
		case 'cost':
		case 'power':
		case 'ram':
			return compileNumeric(node, warnings, node.field);
		case 'rarity':
			return compileRarity(node, warnings);
		case 'name':
			return isReservedWord(node.value, 'none') || isReservedWord(node.value, 'has')
				? droppedInapplicable(node, warnings)
				: compileText(node, warnings, 'name');
		case 'rules':
			return compileText(node, warnings, 'rules');
		case 'text':
			return compileText(node, warnings, 'both');
		case 'legends':
			return compileLegends(node, warnings);
	}
}

function droppedInapplicable(node: FieldNode, warnings: ParseWarning[]): null {
	warn(warnings, node, 'inapplicable-field', valueText(node.value));
	return null;
}

function malformed(node: FieldNode, warnings: ParseWarning[]): null {
	warn(
		warnings,
		node,
		'malformed-value',
		node.value.type === 'regex' ? `/${node.value.pattern}/` : node.value.text
	);
	return null;
}

function requireSimpleOperator(node: FieldNode, warnings: ParseWarning[]): boolean {
	if (node.operator !== ':' && node.operator !== '=') {
		malformed(node, warnings);
		return false;
	}
	if (node.chain !== undefined) {
		malformed(node, warnings);
		return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// Enumerated, never-null fields: color, cardType
// ---------------------------------------------------------------------------

/** Color and Card Type: never null, so — matching Eddiable, Rarity and Set — both `none` and
 * `has` are dropped as inapplicable (spec §3.5) rather than compiled into a silent
 * always-false or always-true predicate. Two branches, not one generic function taking a
 * schema/vocabulary pair: `kind` is checked here, not just typed, which is what lets each
 * return stay a genuinely-typed `Predicate` member with no cast. */
function compileEnumMembership(
	node: FieldNode,
	warnings: ParseWarning[],
	kind: 'color' | 'cardType'
): Predicate | null {
	if (!requireSimpleOperator(node, warnings)) return null;
	if (isReservedWord(node.value, 'none') || isReservedWord(node.value, 'has')) {
		return droppedInapplicable(node, warnings);
	}

	if (kind === 'color') {
		const value = lookupEnum(node.value, ColorSchema, COLORS);
		if (value === null) return malformed(node, warnings);
		return { kind: 'color', values: [value] };
	}
	const value = lookupEnum(node.value, CardTypeSchema, CARD_TYPES);
	if (value === null) return malformed(node, warnings);
	return { kind: 'cardType', values: [value] };
}

function lookupEnum<T extends string>(
	value: ValueNode,
	schema: v.GenericSchema<string, T>,
	vocabulary: readonly T[]
): T | null {
	if (value.type === 'regex') return null;
	const lookup = slugLookup(vocabulary);
	const canonical = lookup.get(value.text.toLowerCase());
	if (canonical === undefined) return null;
	const parsed = v.safeParse(schema, canonical);
	return parsed.success ? parsed.output : null;
}

// ---------------------------------------------------------------------------
// Keyword — enumerated, nullable (array emptiness)
// ---------------------------------------------------------------------------

function compileNullableEnum(
	node: FieldNode,
	warnings: ParseWarning[],
	schema: v.GenericSchema<string, Keyword>,
	vocabulary: readonly Keyword[],
	kind: 'keyword'
): Predicate | null {
	if (!requireSimpleOperator(node, warnings)) return null;
	if (isReservedWord(node.value, 'none')) return { kind, values: [], empty: true };
	if (isReservedWord(node.value, 'has')) return { kind, values: [], empty: false };
	const value = lookupEnum(node.value, schema, vocabulary);
	if (value === null) return malformed(node, warnings);
	return { kind, values: [value] };
}

// ---------------------------------------------------------------------------
// Tag (classification) — free vocabulary from the dataset, nullable
// ---------------------------------------------------------------------------

function compileClassification(
	node: FieldNode,
	ctx: CompileContext,
	warnings: ParseWarning[]
): Predicate | null {
	if (!requireSimpleOperator(node, warnings)) return null;
	if (isReservedWord(node.value, 'none'))
		return { kind: 'classification', values: [], empty: true };
	if (isReservedWord(node.value, 'has'))
		return { kind: 'classification', values: [], empty: false };
	if (node.value.type === 'regex') return malformed(node, warnings);

	const lookup = slugLookup(ctx.dataset.classifications.map((facet) => facet.value));
	const canonical = lookup.get(node.value.text.toLowerCase());
	if (canonical === undefined) return malformed(node, warnings);
	return { kind: 'classification', values: [canonical] };
}

// ---------------------------------------------------------------------------
// Set — free vocabulary from the dataset, never null
// ---------------------------------------------------------------------------

function compileSet(
	node: FieldNode,
	ctx: CompileContext,
	warnings: ParseWarning[]
): Predicate | null {
	if (!requireSimpleOperator(node, warnings)) return null;
	// Never null — every card has at least one printing — so, matching Color/Card
	// Type/Eddiable/Rarity, both `none` and `has` are dropped rather than compiled into a
	// silent always-false or always-true predicate (spec §3.5).
	if (isReservedWord(node.value, 'none') || isReservedWord(node.value, 'has')) {
		return droppedInapplicable(node, warnings);
	}
	if (node.value.type === 'regex') return malformed(node, warnings);

	const lookup = slugLookup(ctx.dataset.sets.map((set) => set.id));
	const canonical = lookup.get(node.value.text.toLowerCase());
	if (canonical === undefined) return malformed(node, warnings);
	return { kind: 'set', values: [canonical] };
}

// ---------------------------------------------------------------------------
// Eddiable — boolean, never null
// ---------------------------------------------------------------------------

function compileEddiable(node: FieldNode, warnings: ParseWarning[]): Predicate | null {
	if (!requireSimpleOperator(node, warnings)) return null;
	if (isReservedWord(node.value, 'none') || isReservedWord(node.value, 'has')) {
		return droppedInapplicable(node, warnings);
	}
	const raw = valueText(node.value).toLowerCase();
	if (raw === 'true') return { kind: 'eddiable', value: true };
	if (raw === 'false') return { kind: 'eddiable', value: false };
	return malformed(node, warnings);
}

// ---------------------------------------------------------------------------
// Numeric fields — cost, power, ram
// ---------------------------------------------------------------------------

function parseIntegerLiteral(text: string): number | null {
	if (!/^\d+$/.test(text)) return null;
	return Number(text);
}

/** A single operator+value into an inclusive `{ min, max }`, desugaring strict comparisons to
 * the adjacent inclusive bound (integer fields only — spec §3.2). */
function boundFromOperator(
	op: CompareOp | ':' | '=',
	num: number
): { min: number | null; max: number | null } {
	switch (op) {
		case ':':
		case '=':
			return { min: num, max: num };
		case '>=':
			return { min: num, max: null };
		case '>':
			return { min: num + 1, max: null };
		case '<=':
			return { min: null, max: num };
		case '<':
			return { min: null, max: num - 1 };
	}
}

function compileNumeric(
	node: FieldNode,
	warnings: ParseWarning[],
	field: NumericField
): Predicate | null {
	if (isReservedWord(node.value, 'none')) {
		if (node.chain !== undefined) return malformed(node, warnings);
		return { kind: 'numeric', field, min: 1, max: 0, includeNull: true };
	}
	if (isReservedWord(node.value, 'has')) {
		if (node.chain !== undefined) return malformed(node, warnings);
		return { kind: 'numeric', field, min: null, max: null, includeNull: false };
	}
	if (node.value.type === 'regex') return malformed(node, warnings);

	const num = parseIntegerLiteral(node.value.text);
	if (num === null) return malformed(node, warnings);
	const primary = boundFromOperator(node.operator, num);

	if (node.chain === undefined) {
		return { kind: 'numeric', field, min: primary.min, max: primary.max, includeNull: false };
	}

	const chainNum = parseIntegerLiteral(valueText(node.chain.value));
	if (chainNum === null) return malformed(node, warnings);
	const secondary = boundFromOperator(node.chain.operator, chainNum);
	return {
		kind: 'numeric',
		field,
		min: primary.min ?? secondary.min,
		max: primary.max ?? secondary.max,
		includeNull: false
	};
}

/** Spec §3.6: `-(cost>=3)` ≡ `cost<3`; `-(cost=3)` ≡ `cost<3 or cost>3`; a negated chained range
 * decomposes to an `or` of the two inverted half-bounds. Never flips `includeNull`. */
function compileInvertedNumericBound(
	node: FieldNode,
	warnings: ParseWarning[],
	field: NumericField
): Predicate | null {
	const num = parseIntegerLiteral(valueText(node.value));
	if (num === null) return malformed(node, warnings);

	if (node.chain !== undefined) {
		const chainNum = parseIntegerLiteral(valueText(node.chain.value));
		if (chainNum === null) return malformed(node, warnings);
		const primary = boundFromOperator(node.operator, num);
		const secondary = boundFromOperator(node.chain.operator, chainNum);
		const min = primary.min ?? secondary.min;
		const max = primary.max ?? secondary.max;
		const children: Predicate[] = [];
		if (min !== null)
			children.push({ kind: 'numeric', field, min: null, max: min - 1, includeNull: false });
		if (max !== null)
			children.push({ kind: 'numeric', field, min: max + 1, max: null, includeNull: false });
		return children.length === 1 ? children[0] : { kind: 'or', children };
	}

	if (node.operator === ':' || node.operator === '=') {
		return {
			kind: 'or',
			children: [
				{ kind: 'numeric', field, min: null, max: num - 1, includeNull: false },
				{ kind: 'numeric', field, min: num + 1, max: null, includeNull: false }
			]
		};
	}

	const bound = boundFromOperator(NEGATE[node.operator], num);
	return { kind: 'numeric', field, min: bound.min, max: bound.max, includeNull: false };
}

// ---------------------------------------------------------------------------
// Rarity — enumerated, ordered, never null
// ---------------------------------------------------------------------------

function rarityIndex(value: ValueNode): number | null {
	if (value.type === 'regex') return null;
	const lookup = slugLookup(RARITY_ORDER);
	const canonical = lookup.get(value.text.toLowerCase());
	if (canonical === undefined) return null;
	const parsed = v.safeParse(RaritySchema, canonical);
	if (!parsed.success) return null;
	return RARITY_ORDER.indexOf(parsed.output);
}

function rarityRange(loIndex: number, hiIndex: number): Predicate {
	return { kind: 'rarity', values: RARITY_ORDER.slice(loIndex, hiIndex + 1) };
}

function compileRarity(node: FieldNode, warnings: ParseWarning[]): Predicate | null {
	if (isReservedWord(node.value, 'none') || isReservedWord(node.value, 'has')) {
		return droppedInapplicable(node, warnings);
	}

	const index = rarityIndex(node.value);
	if (index === null) return malformed(node, warnings);

	if (node.chain === undefined) {
		switch (node.operator) {
			case ':':
			case '=':
				return { kind: 'rarity', values: [RARITY_ORDER[index]] };
			case '>=':
				return rarityRange(index, RARITY_ORDER.length - 1);
			case '>':
				return rarityRange(Math.min(index + 1, RARITY_ORDER.length), RARITY_ORDER.length - 1);
			case '<=':
				return rarityRange(0, index);
			case '<':
				return rarityRange(0, Math.max(index - 1, -1));
		}
	}

	const chainIndex = rarityIndex(node.chain.value);
	if (chainIndex === null) return malformed(node, warnings);
	const bounds = [
		rarityBoundIndex(node.operator, index),
		rarityBoundIndex(node.chain.operator, chainIndex)
	];
	const lo = Math.max(...bounds.map((b) => b.lo).filter((n): n is number => n !== null), 0);
	const hi = Math.min(
		...bounds.map((b) => b.hi).filter((n): n is number => n !== null),
		RARITY_ORDER.length - 1
	);
	if (lo > hi) return malformed(node, warnings);
	return rarityRange(lo, hi);
}

function rarityBoundIndex(
	op: CompareOp | ':' | '=',
	index: number
): { lo: number | null; hi: number | null } {
	switch (op) {
		case ':':
		case '=':
			return { lo: index, hi: index };
		case '>=':
			return { lo: index, hi: null };
		case '>':
			return { lo: index + 1, hi: null };
		case '<=':
			return { lo: null, hi: index };
		case '<':
			return { lo: null, hi: index - 1 };
	}
}

function compileInvertedRarity(node: FieldNode, warnings: ParseWarning[]): Predicate | null {
	const positive = compileRarity(node, warnings);
	if (positive === null || positive.kind !== 'rarity') return null;
	const excluded = new Set(positive.values);
	return { kind: 'rarity', values: RARITY_ORDER.filter((rarity) => !excluded.has(rarity)) };
}

// ---------------------------------------------------------------------------
// Text — bare words, name:, rules:
// ---------------------------------------------------------------------------

function compileText(
	node: FieldNode,
	warnings: ParseWarning[],
	scope: 'name' | 'rules' | 'both'
): Predicate | null {
	if (!requireSimpleOperator(node, warnings)) return null;
	// `none`/`has` are only meaningful after an explicit `rules:` keyword — a bare word "none"
	// (scope 'both', no keyword at all) is an ordinary literal search term, not a presence test.
	if (scope === 'rules' && isReservedWord(node.value, 'none')) {
		return { kind: 'text', query: '', scope, mode: 'substring', empty: true };
	}
	if (scope === 'rules' && isReservedWord(node.value, 'has')) {
		return { kind: 'text', query: '', scope, mode: 'substring', empty: false };
	}

	if (node.value.type === 'regex') {
		const check = compileSafeRegex(node.value.pattern);
		if (!check.ok) {
			// Both of `compileSafeRegex`'s failure reasons (invalid syntax, an unsafe ReDoS
			// shape) collapse to the one `invalid-regex` category spec §6 defines — the parser's
			// warning shape doesn't need to distinguish them from the reader's side.
			warn(warnings, node, 'invalid-regex', `/${node.value.pattern}/`);
			return null;
		}
		return { kind: 'text', query: node.value.pattern, scope, mode: 'regex' };
	}

	return { kind: 'text', query: valueText(node.value), scope, mode: 'substring' };
}

// ---------------------------------------------------------------------------
// legends: — the colored RAM budget
// ---------------------------------------------------------------------------

function compileLegends(node: FieldNode, warnings: ParseWarning[]): Predicate | null {
	if (!requireSimpleOperator(node, warnings)) return null;
	if (node.value.type === 'regex') return malformed(node, warnings);

	const budget = parseLegendsValue(node.value.text);
	if (budget === null) return malformed(node, warnings);
	return { kind: 'ramBudget', budget };
}

// ---------------------------------------------------------------------------
// Negation dispatch for comparable fields
// ---------------------------------------------------------------------------

function compileInvertedBound(node: FieldNode, warnings: ParseWarning[]): Predicate | null {
	if (node.field === 'rarity') return compileInvertedRarity(node, warnings);
	if (node.field === 'cost' || node.field === 'power' || node.field === 'ram') {
		return compileInvertedNumericBound(node, warnings, node.field);
	}
	// Unreachable given `isInvertibleBound`'s guarantee (only cost/power/ram/rarity ever reach
	// here) — written as a real check rather than asserted, so nothing here needs a cast to say.
	return null;
}
