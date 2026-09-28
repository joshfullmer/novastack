/**
 * Which Printing a deck entry shows.
 *
 * A deck entry may name a Printing (`DeckEntry.printingId`); when it doesn't, it means the Card's
 * **Default Printing**, which is `printings[0]` by dataset invariant — `assertions.ts` fails the
 * build if that stops being true. Absence is therefore meaningful and is never backfilled: a deck
 * that never expressed a preference keeps following the default as the dataset changes, which is
 * what you want when a Card gets a nicer reprint.
 *
 * One function rather than `entry.printingId ?? card.printings[0]` inlined at each call site,
 * because the fallback has a second half everyone forgets: a stored id can go **stale**. A printing
 * can leave the dataset between a save and a read (a re-ingest, a corrected id), and the deck still
 * has to render. Resolving through here turns that into the default instead of a blank tile.
 */
import type { Card, Printing } from '#lib/cards/schema.js';

export function deckPrinting(card: Card, printingId?: string): Printing {
	if (printingId !== undefined) {
		const chosen = card.printings.find((printing) => printing.id === printingId);
		if (chosen) return chosen;
	}
	return card.printings[0];
}

/** Whether an entry is following the Card's Default Printing rather than a deliberate choice. */
export function isDefaultPrinting(card: Card, printingId?: string): boolean {
	return deckPrinting(card, printingId).id === card.printings[0].id;
}
