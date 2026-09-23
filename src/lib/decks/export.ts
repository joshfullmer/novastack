/**
 * Deck export formats (`docs/spec/deckbuilder.md` §6).
 *
 * `deckToSimFormat` matches cyberpunk-tcg-sim.online's own import format — verified live
 * against the sim (2026-09-23): its own "Text" export produces
 * `{quantity}x {importCode} {name}` lines under `# Name:` / `# Legends` / `# Main Deck`
 * headers, and pasting that back in round-trips cleanly.
 *
 * `importCode` is the bare Collector Number of `card.printings[0]` (our Default Printing) —
 * **not** `<Category>-<CollectorNumber>` as an earlier version of this file assumed. That
 * assumption was never checked against the sim and was actively wrong: the sim ignores
 * whatever comes before a `-`, so a `MS01-`-style prefix doesn't scope the match to one Set —
 * it silently broadens it to searching every printing and alt-art in the sim's whole card pool
 * by number alone, which is why e.g. `MS01-002` collided with five unrelated cards on import.
 * The bare number alone collides too (Collector Numbers restart at 001 per Set), which is
 * exactly why the sim's own export always pairs the number with the card's name — the name is
 * the real disambiguator, so this does the same.
 *
 * The Category prefix isn't dropped because it's harmless filler, either: nothing is printed on
 * a card as one concatenated `<Category>-<CollectorNumber>` string — the Set Identifier and the
 * Collector Number are two separate printed elements (`CONTEXT.md`). The old comment claiming
 * otherwise was describing an invention, not a fact.
 *
 * Checked against the sim's own `/api/cards/catalog` (150 cards: everything except our one
 * not-tournament-legal promo stub, `rebecca-having-a-moment`, which the sim excludes too) that
 * `card.printings[0]` always matches the sim's own "primary" printing, in both Set and Collector
 * Number, for every card — zero mismatches. That's a checked fact about today's data, not a
 * documented contract between the two sites, since both happen to source from the same
 * upstream — worth re-verifying if a future export mismatch is ever reported.
 *
 * `deckToJson` is the standardized alternative for anything that wants structure instead of a
 * line format; it uses the same `importCode`, but that's incidental — it was never claimed to
 * match the sim and isn't meant to.
 */
import type { Card } from '#lib/cards/schema.js';
import type { DeckEntryGroup } from './grouping.js';

function importCode(card: Card): string {
	return card.printings[0].collectorNumber;
}

export function deckToSimFormat(
	deckName: string,
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[]
): string {
	const legendLines = legends.map((legend) => `1x ${importCode(legend)} ${legend.name}`);
	const mainLines = mainGroups.flatMap((group) =>
		group.entries.map((entry) => `${entry.quantity}x ${importCode(entry.card)} ${entry.card.name}`)
	);

	return [
		`# Name: ${deckName}`,
		'',
		'# Legends',
		...legendLines,
		'',
		'# Main Deck',
		...mainLines
	].join('\n');
}

export function deckToJson(
	deckName: string,
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[]
): string {
	return JSON.stringify(
		{
			name: deckName,
			legends: legends.map((legend) => ({ name: legend.name, id: importCode(legend) })),
			main: mainGroups.flatMap((group) =>
				group.entries.map((entry) => ({
					name: entry.card.name,
					id: importCode(entry.card),
					quantity: entry.quantity
				}))
			)
		},
		null,
		2
	);
}
