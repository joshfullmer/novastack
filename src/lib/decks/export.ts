/**
 * Deck export formats (`docs/spec/deckbuilder.md` §6).
 *
 * `deckToOfficialFormat` is the default text format — the official deckbuilder's own export
 * shape, taken from a real export. It's what everything but Melee should paste.
 *
 * `deckToMeleeFormat` is the paste for a Melee decklist submission, the tournament software.
 * Read out of the official site's own bundle (cyberpunktcg.com, `cyberpunk-melee`), not from a
 * live export — Share needs an account — so a mismatch report is the cue to re-check it: bare
 * `MainDeck` / `Legends` / `Sideboard` headers, `{quantity} {name}` lines with no `x` and no
 * collector number, sections in that order, separated by a blank line. `MainDeck` is always
 * present; the other two only when non-empty. Names are `Name | Subtitle` with a pipe
 * (confirmed against live Melee submissions), rebuilt from `subtitle` rather than taken from
 * `card.name`, whose separator has changed twice.
 *
 * `deckToJson` is the standardized alternative for anything that wants structure instead of a
 * line format. Its `id` is the bare Collector Number of `card.printings[0]` (our Default
 * Printing) — never a `<Category>-<CollectorNumber>` string, which isn't printed on any card.
 */
import type { Card } from '#lib/cards/schema.js';
import type { DeckEntryGroup } from './grouping.js';
import type { DeckEntry } from './legality.js';

function importCode(card: Card): string {
	return card.printings[0].collectorNumber;
}

/** `Name{separator}Subtitle`, rebuilt from `subtitle` whatever separator `card.name` happens to use. */
function subtitledName(card: Card, separator: string): string {
	if (card.subtitle === null) return card.name;
	const base = card.name.slice(0, card.name.length - card.subtitle.length);
	return `${base.replace(/\s*[:\u2013\u2014-]\s*$/, '')}${separator}${card.subtitle}`;
}

const meleeName = (card: Card) => subtitledName(card, ' | ');
const officialName = (card: Card) => subtitledName(card, ': ');

/**
 * The official deckbuilder's own export, taken from a real one (2026-10-15): `# {deck name}`, then
 * `// Legends (n)`, one `// {Type}s (n)` section per card type in deck order, and
 * `// Sideboard (n)` last, separated by a blank line. Counts are copies, not distinct cards, and
 * each line is `{quantity} {name}` with the name written `Name: Subtitle` — Legends and subtitled
 * Units alike. Empty sections are omitted.
 */
export function deckToOfficialFormat(
	deckName: string,
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[],
	sideboard: readonly DeckEntry[]
): string {
	const line = (entry: DeckEntry) => `${entry.quantity} ${officialName(entry.card)}`;
	const sideboardCopies = sideboard.reduce((sum, entry) => sum + entry.quantity, 0);

	return [
		`# ${deckName}`,
		...(legends.length > 0
			? [
					[
						`// Legends (${legends.length})`,
						...legends.map((legend) => `1 ${officialName(legend)}`)
					].join('\n')
				]
			: []),
		...mainGroups.map((group) =>
			[`// ${group.cardType}s (${group.quantity})`, ...group.entries.map(line)].join('\n')
		),
		...(sideboard.length > 0
			? [[`// Sideboard (${sideboardCopies})`, ...sideboard.map(line)].join('\n')]
			: [])
	].join('\n\n');
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
