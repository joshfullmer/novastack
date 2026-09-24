/**
 * **Missing** — what a Deck needs more copies of than the viewer's Collection holds
 * (`CONTEXT.md`).
 *
 * Three properties of the definition drive everything here, and each one is a decision that could
 * plausibly have gone the other way:
 *
 * - **Card level, not Printing level.** A Printing is cosmetic and any copy can be played, so a
 *   Deck asking for a retail printing is satisfied by a beta one. Owned copies are therefore summed
 *   across every Printing of the Card before anything is compared. (`owned:` in the query language
 *   rolls up the same way, for the same reason — see `numericValue` in `#lib/filters/predicate.ts`.)
 * - **Per Deck, independently.** Two Decks wanting the same Card both see it as held, even though
 *   only one of them can be built at a time. Allocating a Collection across Decks would be a
 *   different feature with a different name, and guessing at it would make every number a lie.
 * - **Unaffected by the Collecting Goal.** A Deck needs cards you can actually play, and declining
 *   to collect a Set does not conjure copies of it. The Goal governs Completion, never legality or
 *   availability.
 *
 * Pure, and takes ownership as a lookup rather than reading the store, so it can be unit-tested
 * without a browser and reused by any surface that has a Deck and a Collection.
 */
import type { Card } from '#lib/cards/schema.js';

/** The shape both the deck view and `/explore` already have: a Card and how many it asks for. */
export type NeededCard = { card: Card; quantity: number };

export type MissingCard = {
	card: Card;
	/** Copies the Deck asks for, summed if the Deck names the Card more than once. */
	needed: number;
	/** Copies held, across every Printing of the Card. */
	owned: number;
	/** `needed - owned`, floored at zero. Always ≥ 1 for anything in `MissingReport.cards`. */
	missing: number;
};

export type MissingReport = {
	/** Only Cards actually short, in the order they were given. */
	cards: MissingCard[];
	/** Distinct Cards short — "you're missing 7 cards". */
	cardCount: number;
	/** Copies short across them — "…, 12 copies". The bigger number, and the one to buy against. */
	copyCount: number;
	/** True when the Deck can be built from the Collection as it stands. */
	complete: boolean;
};

/** Copies of a Card held, across all of its Printings. */
export function ownedOfCard(card: Card, ownedOf: (printingId: string) => number): number {
	return card.printings.reduce((total, printing) => total + ownedOf(printing.id), 0);
}

/**
 * What the viewer is short of, to build this Deck.
 *
 * Entries naming the same Card are summed first: a Deck may list one Card twice — two printings of
 * it — and "three copies" is three copies however they are spelled.
 */
export function missingForDeck(
	needed: readonly NeededCard[],
	ownedOf: (printingId: string) => number
): MissingReport {
	const wanted = new Map<string, { card: Card; quantity: number }>();

	for (const entry of needed) {
		const existing = wanted.get(entry.card.slug);
		if (existing) existing.quantity += entry.quantity;
		else wanted.set(entry.card.slug, { card: entry.card, quantity: entry.quantity });
	}

	const cards: MissingCard[] = [];
	let copyCount = 0;

	for (const { card, quantity } of wanted.values()) {
		const owned = ownedOfCard(card, ownedOf);
		const missing = Math.max(0, quantity - owned);
		if (missing === 0) continue;

		cards.push({ card, needed: quantity, owned, missing });
		copyCount += missing;
	}

	return { cards, cardCount: cards.length, copyCount, complete: cards.length === 0 };
}

/**
 * The Printing to put on a Wantlist for a missing Card.
 *
 * A Wantlist entry is per Printing but Missing is per Card, so something has to choose. The Deck's
 * own choice wins when it made one — if it names a beta printing, that is the one being asked for —
 * and otherwise it's the Card's **Default Printing**, which is `printings[0]` by dataset invariant
 * (`assertions.ts` fails the build if it isn't). Never a guess based on what's cheapest or newest:
 * this is a default, and the owner can change the entry afterwards.
 */
export function wantedPrintingId(card: Card, deckPrintingId?: string): string | undefined {
	if (deckPrintingId && card.printings.some((printing) => printing.id === deckPrintingId)) {
		return deckPrintingId;
	}
	return card.printings[0]?.id;
}
