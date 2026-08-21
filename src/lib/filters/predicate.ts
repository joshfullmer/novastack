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
	| { kind: 'keyword'; values: readonly Keyword[] }
	| { kind: 'classification'; values: readonly string[] }
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
	| { kind: 'text'; query: string }
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
			return predicate.values.some((keyword) => card.keywords.includes(keyword));
		case 'classification':
			return predicate.values.some((value) => card.classifications.includes(value));
		case 'eddiable':
			return card.eddiable === predicate.value;
		case 'numeric':
			return testNumeric(card, predicate);
		case 'text': {
			const haystack = dataset.searchText.get(card.slug) ?? '';
			return haystack.includes(normalizeForSearch(predicate.query));
		}
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
