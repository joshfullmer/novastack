/**
 * Groups a deck's non-Legend entries into Unit/Gear/Program sections for display — shared by the
 * deckbuilder's Main Deck panel and a saved deck's read-only view, so their section order, labels,
 * and per-group card ordering can't drift apart.
 *
 * Group order follows `dataset.cardTypeOrder` (derived from the Base Set's own collector-number
 * sequence — `Legend, Unit, Gear, Program`) rather than a hardcoded list, so it stays correct if
 * that derivation ever changes. Cards within a group use the same `DEFAULT_SORT` as `/cards`.
 *
 * `groupMatchesByType` below shares the same group order/labels for the deckbuilder's Main Deck
 * *browse* grid — search/filter results rather than what's already in the deck — but sorts within
 * each group by Cost → Color → Name instead, since Type is already the group boundary there.
 */
import type { Dataset } from '#lib/cards/dataset.js';
import type { Card } from '#lib/cards/schema.js';
import type { CardType } from '#lib/cards/vocabulary.js';
import { compareCards, compareNullable, DEFAULT_SORT } from '#lib/filters/sort.js';
import type { Match } from '#lib/filters/predicate.js';
import type { DeckEntry } from './legality.js';

type NonLegendCardType = Exclude<CardType, 'Legend'>;

export const GROUP_LABELS: Record<NonLegendCardType, string> = {
	Unit: 'Units',
	Gear: 'Gear',
	Program: 'Programs'
};

export type DeckEntryGroup = {
	cardType: NonLegendCardType;
	label: string;
	entries: readonly DeckEntry[];
	/** Total copies in the group. */
	quantity: number;
};

export function groupDeckEntries(
	dataset: Dataset,
	entries: readonly DeckEntry[]
): DeckEntryGroup[] {
	const compare = compareCards(dataset, DEFAULT_SORT);
	const byType = new Map<CardType, DeckEntry[]>();
	for (const entry of entries) {
		const group = byType.get(entry.card.cardType);
		if (group) group.push(entry);
		else byType.set(entry.card.cardType, [entry]);
	}

	return dataset.cardTypeOrder
		.filter((cardType): cardType is NonLegendCardType => cardType !== 'Legend')
		.map((cardType) => {
			const groupEntries = [...(byType.get(cardType) ?? [])].sort((a, b) =>
				compare(a.card, b.card)
			);
			return {
				cardType,
				label: GROUP_LABELS[cardType],
				entries: groupEntries,
				quantity: groupEntries.reduce((sum, entry) => sum + entry.quantity, 0)
			};
		})
		.filter((group) => group.entries.length > 0);
}

export type MatchGroup = {
	cardType: NonLegendCardType;
	label: string;
	matches: readonly Match[];
};

/**
 * Cost → Color → Name — not `DEFAULT_SORT` (Color → Type → Cost → Name). Type is already the
 * group boundary here, so re-sorting by it within a group would be a no-op; what's actually
 * useful browsing one type at a time is a readable cost curve, color as the tiebreak.
 */
function compareByCostColorName(dataset: Dataset, a: Card, b: Card): number {
	const rank = <T>(map: ReadonlyMap<T, number>, value: T) =>
		map.get(value) ?? Number.MAX_SAFE_INTEGER;
	return (
		compareNullable(a.cost, b.cost, 'asc') ||
		rank(dataset.colorRank, a.color) - rank(dataset.colorRank, b.color) ||
		a.name.localeCompare(b.name)
	);
}

/** Same grouping as `groupDeckEntries`, but over search/filter results rather than deck
 * contents — the deckbuilder's Main Deck browse grid, not its already-added list. */
export function groupMatchesByType(dataset: Dataset, matches: readonly Match[]): MatchGroup[] {
	const byType = new Map<CardType, Match[]>();
	for (const match of matches) {
		const group = byType.get(match.card.cardType);
		if (group) group.push(match);
		else byType.set(match.card.cardType, [match]);
	}

	return dataset.cardTypeOrder
		.filter((cardType): cardType is NonLegendCardType => cardType !== 'Legend')
		.map((cardType) => {
			const groupMatches = [...(byType.get(cardType) ?? [])].sort((a, b) =>
				compareByCostColorName(dataset, a.card, b.card)
			);
			return { cardType, label: GROUP_LABELS[cardType], matches: groupMatches };
		})
		.filter((group) => group.matches.length > 0);
}
