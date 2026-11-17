/**
 * A deck's **RAM**: what its three Legends provide together, which is how players name a deck.
 * `yyyyrr` is Yellow 4, Red 2 (a Yellow/Yellow/Red deck today, when every Legend gives 2).
 *
 * The spelling is the query language's own `legends:` value, one letter per RAM, so it needs no
 * assumption about how much a Legend provides, and the same string searches the card database for
 * what that deck may play. Stored in canonical order (`tournament_decks.ram`, so equality and
 * grouping are plain SQL) and shown in the order players say it, dominant colour first.
 *
 * Imported by the ingest script, which runs under plain node: relative `.ts` specifiers only.
 */
import type { Card } from '../cards/schema.ts';
import type { Color } from '../cards/vocabulary.ts';
import { EMPTY_BUDGET } from '../filters/budget.ts';
import { formatLegendsValue, parseLegendsValue } from '../query/legends-value.ts';

/** Longest value a URL may carry: nobody has more RAM than this, and it bounds the parse. */
const MAX_LENGTH = 40;

/** How colours are listed when the amounts tie, and how their letters are chosen. */
const SAY_ORDER: readonly Color[] = ['Red', 'Yellow', 'Green', 'Blue'];

/**
 * The canonical RAM of three Legends, or null when it can't be known: not three, or one provides
 * nothing the dataset knows of. A wrong code would be worse than none.
 */
export function ramOf(legends: readonly Pick<Card, 'color' | 'ramProvided'>[]): string | null {
	if (legends.length !== 3) return null;
	const budget: Record<Color, number> = { ...EMPTY_BUDGET };
	for (const legend of legends) {
		if (legend.ramProvided === null) return null;
		budget[legend.color] += legend.ramProvided;
	}
	return formatLegendsValue(budget) || null;
}

/** A `legends:`-style value from outside (a URL) as the canonical RAM, or null if it isn't one. */
export function parseRam(raw: string | null): string | null {
	if (raw === null || raw.length > MAX_LENGTH) return null;
	const budget = parseLegendsValue(raw);
	return budget === null ? null : formatLegendsValue(budget) || null;
}

/** The colours of a RAM and how much of each, most first, as players say it. */
export function ramParts(ram: string): { colour: Color; amount: number }[] {
	const budget = parseLegendsValue(ram);
	if (budget === null) return [];
	return SAY_ORDER.filter((colour) => budget[colour] > 0)
		.map((colour) => ({ colour, amount: budget[colour] }))
		.sort((a, b) => b.amount - a.amount);
}

/** The RAM as said: `yyyyrr`. */
export function ramLabel(ram: string): string {
	return ramParts(ram)
		.map(({ colour, amount }) => colour[0].toLowerCase().repeat(amount))
		.join('');
}
