/**
 * Preserving Printing choices across a save by someone who **can't make them**.
 *
 * `choose-printing` is a paid capability (`#lib/entitlements.ts`), and the question it raises is
 * what happens to choices already stored when a grant lapses. The answer this module implements:
 *
 * > The deck keeps its printings and keeps rendering them. Only *changing* them is gated.
 *
 * A deck is the user's work; the feature is rented. Taking the art back out of a deck someone built
 * while they were paying would be the kind of thing people quite reasonably get angry about, and
 * nothing about rendering a stored printing costs anything to serve.
 *
 * The trap that makes this a module rather than one line in the action: the editor posts the whole
 * payload, so an unentitled client's payload simply *has no* `printingId`s (the UI that sets them
 * is hidden). Accepting it verbatim would silently erase every choice the moment they renamed a
 * card's quantity — data loss as a side effect of an unrelated edit. So the server ignores what an
 * unentitled client says about printings and re-applies what was already stored, keyed by card.
 *
 * Deliberately **not** a rejection: refusing the save would block an unentitled user from editing
 * their own deck at all. They can add, remove and reorder freely; the printings just don't move.
 */
import type { DeckEntryPayload, DeckVersionPayload, LegendEntryPayload } from './schema.js';

/** Card slug → the Printing the stored version chose for it, across both piles and the Legends. */
function printingsBySlug(version: DeckVersionPayload): Map<string, string> {
	const printings = new Map<string, string>();
	for (const entry of [...version.entries, ...version.sideboard]) {
		if (entry.printingId !== undefined) printings.set(entry.cardSlug, entry.printingId);
	}
	for (const legend of version.legends) {
		if (legend.printingId !== undefined) printings.set(legend.cardSlug, legend.printingId);
	}
	return printings;
}

function withCarriedPrinting<T extends { cardSlug: string; printingId?: string }>(
	item: T,
	printings: ReadonlyMap<string, string>
): T {
	const carried = printings.get(item.cardSlug);
	// Rebuilt without the key rather than set to `undefined`: absence is what "use the default"
	// means on the wire, and the schema's optional field doesn't treat the two as equal.
	const rest = { ...item };
	delete rest.printingId;
	return carried === undefined ? rest : { ...rest, printingId: carried };
}

/**
 * The payload to actually store for an unentitled save: everything the client sent, except that
 * every Printing comes from `stored` instead.
 *
 * Keyed by **card slug, not position**, so a deck reordered or partly rebuilt still keeps its art.
 * Two consequences worth naming:
 *
 * - A card added while unentitled has no stored printing, so it takes the Default Printing. Right
 *   answer: they never chose one, and there's nothing to preserve.
 * - A card removed and later re-added *does* get its old printing back, because the stored version
 *   still names it. Slightly surprising in the abstract, but it's the same rule ("the deck's stored
 *   choice wins") and the alternative is worse — silently downgrading art on a card that was only
 *   briefly out of the list.
 *
 * `stored` is `null` for a deck with no saved version yet, in which case there is nothing to carry
 * and every printing is simply dropped.
 */
export function carryForwardPrintings(
	stored: DeckVersionPayload | null,
	incoming: DeckVersionPayload
): DeckVersionPayload {
	const printings = stored === null ? new Map<string, string>() : printingsBySlug(stored);

	return {
		entries: incoming.entries.map(
			(entry): DeckEntryPayload => withCarriedPrinting(entry, printings)
		),
		sideboard: incoming.sideboard.map(
			(entry): DeckEntryPayload => withCarriedPrinting(entry, printings)
		),
		legends: incoming.legends.map(
			(legend): LegendEntryPayload => withCarriedPrinting(legend, printings)
		)
	};
}
