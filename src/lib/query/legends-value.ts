/**
 * `legends:` value grammar (spec §3.3): a sequence of color-letter tokens, each a color letter
 * optionally followed by digits. A bare letter contributes 1 to that color's running total; a
 * digit-suffixed letter contributes that number. The final total per color is the sum of all its
 * occurrences — one rule, so `rryyyy`, `r2y4`, and `rry4` all reduce to the same value. No
 * separator is required; an optional comma between tokens is accepted as chrome.
 *
 * **Case carries the unit.** A lowercase letter counts RAM, exactly. An UPPERCASE letter counts
 * Legends, each providing `ramPerLegend` RAM: the shorthand players use, so `YYR` is `yyyyrr` today.
 * Only the uppercase spelling depends on what a Legend provides; lowercase never changes meaning.
 */
import { COLORS, type Color } from '../cards/vocabulary.ts';
import { EMPTY_BUDGET, type ColorBudget } from '../filters/budget.ts';

const LETTER_TO_COLOR: Readonly<Record<string, Color>> = {
	r: 'Red',
	y: 'Yellow',
	g: 'Green',
	b: 'Blue'
};

const TOKEN = /^([rygbRYGB])(\d*),?/;

/**
 * Parses a `legends:` value into a `ColorBudget`, or `null` if any part is malformed. `ramPerLegend`
 * is what an uppercase letter is worth, per Legend; a lowercase letter is worth 1 RAM regardless.
 */
export function parseLegendsValue(raw: string, ramPerLegend: number): ColorBudget | null {
	if (raw === '') return null;

	const totals: Record<Color, number> = { ...EMPTY_BUDGET };
	let rest = raw;

	while (rest.length > 0) {
		const match = rest.match(TOKEN);
		if (match === null) return null;

		// TOKEN's character class is exactly LETTER_TO_COLOR's keys, so this lookup always hits.
		const color = LETTER_TO_COLOR[match[1].toLowerCase()];

		const unit = match[1] === match[1].toUpperCase() ? ramPerLegend : 1;
		const count = match[2] === '' ? 1 : Number(match[2]);
		totals[color] += unit * count;
		rest = rest.slice(match[0].length);
	}

	return totals;
}

/** The canonical tally spelling — what chips serialise, per spec §3.3. */
export function formatLegendsValue(budget: ColorBudget): string {
	return COLORS.filter((color) => budget[color] > 0)
		.map((color) => color[0].toLowerCase().repeat(budget[color]))
		.join('');
}
