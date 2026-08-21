/**
 * The filter engine: a pure predicate tree, isolated from Svelte.
 *
 * ```
 * controls → PredicateTree → evaluate(dataset, tree) → Match[]
 * ```
 *
 * The tree shape is not decoration. A later query-language parser must target *this*
 * evaluator, so the tree carries `and` / `or` / `not` even though stage 1's controls only ever
 * build a flat conjunction: OR within a facet, AND across facets.
 *
 * **`evaluate` returns a witness, not a boolean.** A `Match` is `{ card, printing }` — the
 * printing that matched — because the grid shows the matching art, and the three rarities that
 * exist only on non-default printings are otherwise unreachable.
 *
 * Every predicate is tested against a `(card, printing)` pair, and a card matches when *some*
 * printing satisfies the whole tree. That existential is deliberate: it makes Set and Rarity
 * apply to the **same** printing, so "Iconic Legends in the box toppers" means a printing that
 * is both, and the returned witness genuinely satisfies everything the user asked for.
 */
import type { Card, Printing } from '#lib/cards/schema.js';
import type { Dataset } from '#lib/cards/dataset.js';
import { normalizeForSearch } from '#lib/cards/dataset.js';
import { plainText } from '#lib/cards/rules-text.js';
import type { CardType, Color, Keyword, Rarity } from '#lib/cards/vocabulary.js';
import { admits, type ColorBudget } from './budget.js';

/** The nullable numeric facets. Note RAM means *required*: a Legend requires none. */
export type NumericField = 'cost' | 'power' | 'ram';

export type Predicate =
	| { kind: 'all' }
	| { kind: 'and'; children: readonly Predicate[] }
	| { kind: 'or'; children: readonly Predicate[] }
	| { kind: 'not'; child: Predicate }
	| { kind: 'color'; values: readonly Color[] }
	| { kind: 'cardType'; values: readonly CardType[] }
	| {
			kind: 'keyword';
			values: readonly Keyword[];
			/** Array emptiness (`keyword:none`/`keyword:has`) — additive for the query language.
			 * When set, `values` is ignored; `true` tests for no keywords at all, `false` for any. */
			empty?: boolean;
	  }
	| {
			kind: 'classification';
			values: readonly string[];
			/** Array emptiness (`tag:none`/`tag:has`) — same shape as `keyword`'s `empty`. */
			empty?: boolean;
	  }
	| { kind: 'eddiable'; value: boolean }
	| {
			kind: 'numeric';
			field: NumericField;
			/** `null` means unbounded. A bound **never** admits null. */
			min: number | null;
			max: number | null;
			/** The explicit `+ none` bucket. A null is never zero. */
			includeNull: boolean;
	  }
	| {
			kind: 'text';
			query: string;
			/** Plain substring (default) or a query-language regex, already safety-checked. */
			mode?: 'substring' | 'regex';
			/** Which haystack: name only, rules text only, or both (default — stage 1's behaviour). */
			scope?: 'name' | 'rules' | 'both';
			/** The searched haystack is empty (`rules:none`/`rules:has`) — `query` is ignored when set. */
			empty?: boolean;
	  }
	| { kind: 'ramBudget'; budget: ColorBudget }
	| { kind: 'set'; values: readonly string[] }
	| { kind: 'rarity'; values: readonly Rarity[] };

export type Match = { card: Card; printing: Printing };

function numericValue(card: Card, field: NumericField): number | null {
	switch (field) {
		case 'cost':
			return card.cost;
		case 'power':
			return card.power;
		case 'ram':
			return card.ramRequired;
	}
}

function testNumeric(card: Card, predicate: Extract<Predicate, { kind: 'numeric' }>): boolean {
	const value = numericValue(card, predicate.field);

	// A null is a distinct bucket and never zero, so no bound can reach it. Without this,
	// `power ≥ 0` would silently drop 43 cards while looking like it selected everything.
	if (value === null) return predicate.includeNull;
	if (predicate.min !== null && value < predicate.min) return false;
	if (predicate.max !== null && value > predicate.max) return false;
	return true;
}

/** The normalized haystack `substring` mode and `empty` both use — case/accent/punctuation
 * insensitive, matching stage 1's own behaviour for the default `both` scope unchanged. */
function normalizedHaystack(
	dataset: Dataset,
	card: Card,
	scope: 'name' | 'rules' | 'both'
): string {
	switch (scope) {
		case 'both':
			return dataset.searchText.get(card.slug) ?? '';
		case 'name':
			return normalizeForSearch(card.name);
		case 'rules':
			return normalizeForSearch(plainText(card.rulesText));
	}
}

/** `regex` mode matches the literal rendered text, not the substring-search normalization — a
 * pattern is how someone reaches punctuation and casing that substring mode deliberately hides,
 * so mangling it first would defeat the point of offering regex at all. */
function rawHaystack(card: Card, scope: 'name' | 'rules' | 'both'): string {
	switch (scope) {
		case 'both':
			return `${card.name} ${plainText(card.rulesText)}`;
		case 'name':
			return card.name;
		case 'rules':
			return plainText(card.rulesText);
	}
}

function testText(
	dataset: Dataset,
	card: Card,
	predicate: Extract<Predicate, { kind: 'text' }>
): boolean {
	const scope = predicate.scope ?? 'both';
	if (predicate.empty !== undefined) {
		return (normalizedHaystack(dataset, card, scope) === '') === predicate.empty;
	}
	if ((predicate.mode ?? 'substring') === 'regex') {
		// Safety (ReDoS-shape rejection, syntax validity) is checked once, at parse time
		// (`#lib/query/regex-safety.js`) — by the time a `mode: 'regex'` leaf reaches the
		// evaluator its pattern is already vetted, so this never needs to reject anything itself.
		try {
			return new RegExp(predicate.query, 'iu').test(rawHaystack(card, scope));
		} catch {
			return false;
		}
	}
	return normalizedHaystack(dataset, card, scope).includes(normalizeForSearch(predicate.query));
}

export function test(
	predicate: Predicate,
	dataset: Dataset,
	card: Card,
	printing: Printing
): boolean {
	switch (predicate.kind) {
		case 'all':
			return true;
		case 'and':
			return predicate.children.every((child) => test(child, dataset, card, printing));
		case 'or':
			return predicate.children.some((child) => test(child, dataset, card, printing));
		case 'not':
			return !test(predicate.child, dataset, card, printing);
		case 'color':
			return predicate.values.includes(card.color);
		case 'cardType':
			return predicate.values.includes(card.cardType);
		case 'keyword':
			if (predicate.empty !== undefined) return (card.keywords.length === 0) === predicate.empty;
			return predicate.values.some((keyword) => card.keywords.includes(keyword));
		case 'classification':
			if (predicate.empty !== undefined) {
				return (card.classifications.length === 0) === predicate.empty;
			}
			return predicate.values.some((value) => card.classifications.includes(value));
		case 'eddiable':
			return card.eddiable === predicate.value;
		case 'numeric':
			return testNumeric(card, predicate);
		case 'text':
			return testText(dataset, card, predicate);
		case 'ramBudget':
			return admits(predicate.budget, card);
		case 'set':
			return predicate.values.includes(printing.setId);
		case 'rarity':
			return predicate.values.includes(printing.rarity);
	}
}

/**
 * Evaluates the tree over the dataset, returning one `Match` per matching Card.
 *
 * The grid lists Cards, one tile each — so a card matching only through a non-default printing
 * appears once, showing *that* printing's art. Witness selection is "prefer the Default
 * Printing if it qualifies, else the first that does", which is exactly the first qualifying
 * printing, since the Default Printing is `printings[0]`.
 */
export function evaluate(dataset: Dataset, tree: Predicate): Match[] {
	const matches: Match[] = [];

	for (const card of dataset.cards) {
		for (const printing of card.printings) {
			if (!test(tree, dataset, card, printing)) continue;
			matches.push({ card, printing });
			break;
		}
	}

	return matches;
}

/** Flattens a conjunction, dropping the `all` predicates that represent an inactive control. */
export function and(children: readonly Predicate[]): Predicate {
	const active = children.filter((child) => child.kind !== 'all');
	if (active.length === 0) return { kind: 'all' };
	if (active.length === 1) return active[0];
	return { kind: 'and', children: active };
}
