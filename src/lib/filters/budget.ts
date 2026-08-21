/**
 * The colored RAM budget.
 *
 * A deck picks three Legends, and their combined RAM Provided per Color sets which Cards the
 * deck may include. Because every Legend provides the same RAM of its own color — asserted at
 * ingest, not assumed — the *colors alone* determine the budget. So the control is three
 * color slots rather than three Legend pickers: three clicks, and an illegal budget is
 * unreachable rather than merely rejected.
 *
 * `admits` is a pure function of budget and card so stage 2 inherits it unchanged.
 */
import type { Card } from '#lib/cards/schema.js';
import { COLORS, type Color } from '#lib/cards/vocabulary.js';

export type ColorBudget = Readonly<Record<Color, number>>;

export const EMPTY_BUDGET: ColorBudget = { Blue: 0, Green: 0, Red: 0, Yellow: 0 };

/** Three slots' worth of colors → RAM per color. Fewer than three slots is a partial deck. */
export function budgetFromLegendColors(
	legendColors: readonly Color[],
	ramPerLegend: number
): ColorBudget {
	const budget: Record<Color, number> = { ...EMPTY_BUDGET };
	for (const color of legendColors) budget[color] += ramPerLegend;
	return budget;
}

/**
 * One admission rule for every card type — *is this card usable in a deck of this color
 * identity?*
 *
 * A color with no budget is excluded entirely, **Legends included**. On-color Legends do
 * remain, because the slots declare colors rather than cards: the actual Legend is still to be
 * chosen, so showing the candidates is the useful answer.
 *
 * RAM is a **threshold, not a budget** — clearing the bar admits unlimited copies, and
 * including a card consumes nothing. `ramProvided` of null counts as 0.
 */
export function admits(budget: ColorBudget, card: Card): boolean {
	const available = budget[card.color];
	if (available <= 0) return false;
	return card.cardType === 'Legend' || (card.ramRequired ?? 0) <= available;
}

/** True when no slot is set, in which case the budget filters nothing. */
export function isEmptyBudget(budget: ColorBudget): boolean {
	return COLORS.every((color) => budget[color] === 0);
}
