/**
 * Groups a deck's non-Legend entries into Unit/Gear/Program sections for display — shared by the
 * deckbuilder's Main Deck panel and a saved deck's read-only view, so their section order, labels,
 * and per-group card ordering can't drift apart.
 *
 * Group order follows `dataset.cardTypeOrder` (derived from the Base Set's own collector-number
 * sequence — `Legend, Unit, Gear, Program`) rather than a hardcoded list, so it stays correct if
 * that derivation ever changes. Cards within a group use the same `DEFAULT_SORT` as `/cards`.
 */
import type { Dataset } from '#lib/cards/dataset.js';
import type { CardType } from '#lib/cards/vocabulary.js';
import { compareCards, DEFAULT_SORT } from '#lib/filters/sort.js';
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
	/** Total copies in the group — matches the export format's `Main Deck (43)` convention. */
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
