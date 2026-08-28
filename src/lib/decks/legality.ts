/**
 * Deck legality — see `docs/spec/deckbuilder.md` §2 and §4.
 *
 * `admits` from `#lib/filters/budget.js` is reused unchanged; everything here is about building
 * the budget from the *chosen* Legends and reporting what a budget doesn't cover, not about
 * re-deriving the admission rule itself.
 */
import { legendBaseName } from '#lib/cards/derive.js';
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

export type LegendNameConflict = { baseName: string; legends: readonly Card[] };

/**
 * Comprehensive rules, "Card Data > Name": two Legends sharing a base name can't be in the same
 * deck — e.g. "V — Streetkid" and "V — Corporate Exile" are both "V". Grouped rather than
 * pairwise, so a future increase past `LEGEND_SLOTS` still reports correctly if three Legends
 * ever collide on one name at once.
 */
export function legendNameConflicts(legends: readonly Card[]): readonly LegendNameConflict[] {
	const groups = new Map<string, Card[]>();
	for (const legend of legends) {
		const baseName = legendBaseName(legend);
		const group = groups.get(baseName);
		if (group) group.push(legend);
		else groups.set(baseName, [legend]);
	}

	return [...groups.entries()]
		.filter(([, group]) => group.length > 1)
		.map(([baseName, group]) => ({ baseName, legends: group }));
}

export type DeckIssue = { kind: 'size' | 'ram' | 'legend-names'; message: string };

/**
 * Every persistent, non-blocking legality signal combined into one list — RAM, deck size, and
 * Legend-name conflicts today. None of these ever block editing (§4); this is what lets a single
 * "deck is invalid, and here's why" banner exist without each screen assembling its own wording,
 * and lets a future rule show up everywhere this is rendered just by pushing another `DeckIssue`.
 */
export function deckIssues(args: {
	totalCards: number;
	sizeStatus: SizeStatus;
	violations: readonly DeckEntry[];
	nameConflicts: readonly LegendNameConflict[];
}): readonly DeckIssue[] {
	const issues: DeckIssue[] = [];

	if (args.sizeStatus === 'under')
		issues.push({
			kind: 'size',
			message: `Deck has ${args.totalCards} card${args.totalCards === 1 ? '' : 's'} — the legal minimum is ${MIN_DECK_SIZE}.`
		});
	else if (args.sizeStatus === 'over')
		issues.push({
			kind: 'size',
			message: `Deck has ${args.totalCards} cards — the legal maximum is ${MAX_DECK_SIZE}.`
		});

	if (args.violations.length > 0)
		issues.push({
			kind: 'ram',
			message: `${args.violations.length} ${args.violations.length === 1 ? 'card exceeds' : 'cards exceed'} this deck's Legends' RAM: ${args.violations.map((entry) => entry.card.name).join(', ')}.`
		});

	for (const conflict of args.nameConflicts)
		issues.push({
			kind: 'legend-names',
			message: `Legends can't share a name: ${conflict.legends.map((legend) => legend.name).join(' and ')} are both "${conflict.baseName}".`
		});

	return issues;
}
