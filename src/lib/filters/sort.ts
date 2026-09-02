/**
 * Sorting.
 *
 * **Default: Color → Card Type → Cost → Name**, using the orders derived at ingest. Collector
 * number already produces perfect color and type grouping within the Base Set, so the explicit
 * sort buys one thing: cost orders *within* each color+type block, giving a readable curve.
 * `Set → Collector Number` is consequently not reachable in stage 1.
 *
 * **Nulls always sort last** — one rule, everywhere, in both directions. This bites: `power` is
 * null on 43 of 133 cards, so a Power sort parks nearly a third of the grid at the end. That is
 * the honest presentation of "this card has no power", and it is why the rule is stated rather
 * than discovered.
 */
import type { Dataset } from '#lib/cards/dataset.js';
import type { Card } from '#lib/cards/schema.js';
import type { Match } from './predicate.js';

export const SORT_KEYS = ['default', 'cost', 'power', 'name'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type Sort = { key: SortKey; direction: SortDirection };

export const DEFAULT_SORT: Sort = { key: 'default', direction: 'asc' };

export const SORT_LABELS: Record<SortKey, string> = {
	default: 'Color, type, cost',
	cost: 'Cost',
	power: 'Power',
	name: 'Name'
};

/**
 * Compares two possibly-null numbers, keeping nulls last regardless of direction — so the
 * caller must apply direction to the *result* only when both values are present. Exported for
 * `#lib/decks/grouping.js`'s own Cost → Color → Name comparator, which needs the same
 * nulls-last rule for `cost` without pulling in a whole `Sort` key for it.
 */
export function compareNullable(a: number | null, b: number | null, direction: SortDirection): number {
	if (a === null && b === null) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return direction === 'asc' ? a - b : b - a;
}

function compareNames(a: Card, b: Card): number {
	return a.name.localeCompare(b.name);
}

export function compareCards(dataset: Dataset, sort: Sort): (a: Card, b: Card) => number {
	const rank = <T>(map: ReadonlyMap<T, number>, value: T) =>
		map.get(value) ?? Number.MAX_SAFE_INTEGER;

	switch (sort.key) {
		case 'default':
			return (a, b) =>
				rank(dataset.colorRank, a.color) - rank(dataset.colorRank, b.color) ||
				rank(dataset.cardTypeRank, a.cardType) - rank(dataset.cardTypeRank, b.cardType) ||
				compareNullable(a.cost, b.cost, 'asc') ||
				compareNames(a, b);
		case 'cost':
			return (a, b) => compareNullable(a.cost, b.cost, sort.direction) || compareNames(a, b);
		case 'power':
			return (a, b) => compareNullable(a.power, b.power, sort.direction) || compareNames(a, b);
		case 'name':
			return (a, b) => (sort.direction === 'asc' ? compareNames(a, b) : compareNames(b, a));
	}
}

/** Sorts matches without mutating the input, so `$derived` results stay predictable. */
export function sortMatches(dataset: Dataset, matches: readonly Match[], sort: Sort): Match[] {
	const compare = compareCards(dataset, sort);
	return [...matches].sort((a, b) => compare(a.card, b.card));
}
