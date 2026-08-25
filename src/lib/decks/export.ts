/**
 * Deck export formats (`docs/spec/deckbuilder.md` §6).
 *
 * Both use the identifier printed on the card — `<Category>-<CollectorNumber>`, e.g. `MS01-050`
 * — never a Netdeck UUID or slug, so an export stays meaningful outside this app.
 *
 * `deckToSimFormat` matches cyberpunk-tcg-sim.online's own import format: `{quantity}x {id}`,
 * one card per line, Legends included as 1x lines. `deckToJson` is the standardized alternative
 * for anything that wants structure instead of a line format.
 */
import { findSetIdentifier } from '#lib/cards/sets.js';
import type { Card } from '#lib/cards/schema.js';
import type { DeckEntryGroup } from './grouping.js';

function printedIdentifier(card: Card): string {
	const printing = card.printings[0];
	const set = findSetIdentifier(printing.setId);
	return `${set?.category ?? printing.setId}-${printing.collectorNumber}`;
}

export function deckToSimFormat(
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[]
): string {
	const lines = legends.map((legend) => `1x ${printedIdentifier(legend)}`);
	for (const group of mainGroups) {
		for (const entry of group.entries)
			lines.push(`${entry.quantity}x ${printedIdentifier(entry.card)}`);
	}
	return lines.join('\n');
}

export function deckToJson(
	deckName: string,
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[]
): string {
	return JSON.stringify(
		{
			name: deckName,
			legends: legends.map((legend) => ({ name: legend.name, id: printedIdentifier(legend) })),
			main: mainGroups.flatMap((group) =>
				group.entries.map((entry) => ({
					name: entry.card.name,
					id: printedIdentifier(entry.card),
					quantity: entry.quantity
				}))
			)
		},
		null,
		2
	);
}
