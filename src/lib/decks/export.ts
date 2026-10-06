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
 * **`deckToSimFormat` carries the sideboard under `# Sideboard`.** Verified live against the sim on
 * 2026-10-06 — it had no sideboard when this format was first checked (2026-09-23), and shipped
 * one after: its own Text export of a 2-card sideboard is `# Name: …`, a blank line, `# Sideboard`,
 * then the same `{quantity}x {number} {name}` lines. Like the sim, an empty Sideboard has no
 * header at all, so a deck without one exports exactly the text it always did. See
 * `docs/research/sideboards.md` §6.2.
 *
 * `deckToMeleeFormat` is the paste for a Melee decklist submission, the tournament software.
 * Read out of the official site's own bundle (cyberpunktcg.com, `cyberpunk-melee`), not from a
 * live export — Share needs an account — so a mismatch report is the cue to re-check it: bare
 * `MainDeck` / `Legends` / `Sideboard` headers, `{quantity} {name}` lines with no `x` and no
 * collector number, sections in that order, separated by a blank line. `MainDeck` is always
 * present; the other two only when non-empty. Names are `Name — Subtitle` with an em dash,
 * rebuilt from `subtitle` rather than taken from `card.name`, whose separator has changed twice.
 *
 * `deckToJson` is the standardized alternative for anything that wants structure instead of a
 * line format; it uses the same `importCode`, but that's incidental — it was never claimed to
 * match the sim and isn't meant to.
 */
import type { Card } from '#lib/cards/schema.js';
import type { DeckEntryGroup } from './grouping.js';
import type { DeckEntry } from './legality.js';

function importCode(card: Card): string {
	return card.printings[0].collectorNumber;
}

export function deckToSimFormat(
	deckName: string,
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[],
	sideboard: readonly DeckEntry[]
): string {
	const simLine = (entry: DeckEntry) =>
		`${entry.quantity}x ${importCode(entry.card)} ${entry.card.name}`;

	return [
		`# Name: ${deckName}`,
		'',
		'# Legends',
		...legends.map((legend) => `1x ${importCode(legend)} ${legend.name}`),
		'',
		'# Main Deck',
		...mainGroups.flatMap((group) => group.entries.map(simLine)),
		...(sideboard.length > 0 ? ['', '# Sideboard', ...sideboard.map(simLine)] : [])
	].join('\n');
}

/** `Name — Subtitle`, the separator Melee's own export uses, whatever `card.name` happens to use. */
function meleeName(card: Card): string {
	if (card.subtitle === null) return card.name;
	const base = card.name.slice(0, card.name.length - card.subtitle.length);
	return `${base.replace(/\s*[:\u2013\u2014-]\s*$/, '')} \u2014 ${card.subtitle}`;
}

export function deckToMeleeFormat(
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[],
	sideboard: readonly DeckEntry[]
): string {
	const line = (entry: DeckEntry) => `${entry.quantity} ${meleeName(entry.card)}`;
	const section = (header: string, lines: readonly string[]) => [header, ...lines].join('\n');

	return [
		section(
			'MainDeck',
			mainGroups.flatMap((group) => group.entries.map(line))
		),
		...(legends.length > 0
			? [
					section(
						'Legends',
						legends.map((legend) => `1 ${meleeName(legend)}`)
					)
				]
			: []),
		...(sideboard.length > 0 ? [section('Sideboard', sideboard.map(line))] : [])
	].join('\n\n');
}

export function deckToJson(
	deckName: string,
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[],
	sideboard: readonly DeckEntry[]
): string {
	const line = (entry: DeckEntry) => ({
		name: entry.card.name,
		id: importCode(entry.card),
		quantity: entry.quantity
	});

	return JSON.stringify(
		{
			name: deckName,
			legends: legends.map((legend) => ({ name: legend.name, id: importCode(legend) })),
			main: mainGroups.flatMap((group) => group.entries.map(line)),
			// Always present, `[]` included — a consumer shouldn't have to tell "no sideboard" apart
			// from "this exporter predates sideboards."
			sideboard: sideboard.map(line)
		},
		null,
		2
	);
}
