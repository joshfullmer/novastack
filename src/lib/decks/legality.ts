/**
 * Deck legality — see `docs/spec/deckbuilder.md` §2 and §4.
 *
 * `admits` from `#lib/filters/budget.js` is reused unchanged; everything here is about building
 * the budget from the *chosen* Legends and reporting what a budget doesn't cover, not about
 * re-deriving the admission rule itself.
 */
import type { Card } from '#lib/cards/schema.js';
import type { Color } from '#lib/cards/vocabulary.js';
import { admits, EMPTY_BUDGET, type ColorBudget } from '#lib/filters/budget.js';

export const LEGEND_SLOTS = 3;
export const MIN_DECK_SIZE = 40;
export const MAX_DECK_SIZE = 50;
export const MAX_COPIES = 3;

export type SizeStatus = 'under' | 'legal' | 'over';
export type DeckEntry = { card: Card; quantity: number; printingId?: string };

/**
 * Sums the *chosen* Legends' own `ramProvided` per Color — not a slot count multiplied by the
 * dataset's `ramPerLegend` constant. Deliberately forward-compatible with Legends ever providing
 * non-uniform RAM; deck construction still fixes exactly 3 Legends regardless of how many are
 * passed here.
 */
export function budgetFromLegends(legends: readonly Card[]): ColorBudget {
	const budget: Record<Color, number> = { ...EMPTY_BUDGET };
	for (const legend of legends) budget[legend.color] += legend.ramProvided ?? 0;
	return budget;
}

/** Never blocks — a deck under construction is supposed to sit outside 40–50 most of the time. */
export function deckSizeStatus(totalCards: number): SizeStatus {
	if (totalCards < MIN_DECK_SIZE) return 'under';
	if (totalCards > MAX_DECK_SIZE) return 'over';
	return 'legal';
}

/**
 * Entries the current budget doesn't cover — the authoritative RAM-legality signal, independent
 * of *when* the mismatch arose (a card added before any Legend existed reports identically to
 * one that became illegal after a Legend was swapped out).
 */
export function ramViolations(
	entries: readonly DeckEntry[],
	budget: ColorBudget
): readonly DeckEntry[] {
	return entries.filter((entry) => !admits(budget, entry.card));
}
