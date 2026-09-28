/**
 * The Deck view's **Collection** tab — reconciling a decklist against what the viewer owns.
 *
 * `missing.ts` answers "what am I short of", which is a *report*. This answers the editing
 * question next to it: for every card in the list, how many do I hold, which Printing does a
 * change write to, and what would "add everything I'm missing" actually do? Kept pure and separate
 * from the component for the usual reason — the arithmetic is where the bugs are, and none of it
 * needs a browser to test.
 *
 * **Card-level counts, Printing-level writes.** That split is forced and is the source of every
 * subtlety here: a Deck needs *a card* and any printing plays, so ownership is summed across
 * printings (`ownedOfCard`) — but `collection_items` is keyed per Printing, so a `+1` has to name
 * one. The rules below say which.
 */
import type { Card } from '#lib/cards/schema.js';
import { ownedOfCard, wantedPrintingId, type NeededCard } from './missing.js';

export type DeckCollectionRow = {
	card: Card;
	/** Copies the deck asks for, summed across entries naming the same card. */
	needed: number;
	/** Copies held, across every Printing of the card. */
	owned: number;
	/** `needed - owned`, floored at zero. */
	missing: number;
	/** The Printing a `+1` writes to — the deck's own choice if it made one, else the default. */
	addTarget: string;
	/** How many distinct Printings of this card the viewer holds. >1 explains a surprising total. */
	printingsHeld: number;
};

/**
 * One row per **distinct card** in the deck, in the order the deck first names it.
 *
 * Deliberately every card, not just the short ones: this is a checklist you work down while
 * counting a physical pile, and a list that silently omits what you already own gives you nothing
 * to tick off and no way to correct a count that's too high.
 *
 * Entries naming the same card are summed — a deck may list a card twice (two printings of it),
 * and "three copies" is three copies however it's spelled.
 */
export function deckCollectionRows(
	entries: readonly NeededCard[],
	ownedOf: (printingId: string) => number
): DeckCollectionRow[] {
	const bySlug = new Map<string, { card: Card; needed: number; printingId?: string }>();

	for (const entry of entries) {
		const existing = bySlug.get(entry.card.slug);
		if (existing) existing.needed += entry.quantity;
		else {
			bySlug.set(entry.card.slug, {
				card: entry.card,
				needed: entry.quantity,
				// `NeededCard` carries no printing today; when the deck view starts passing one
				// through, `wantedPrintingId` already honours it.
				printingId: (entry as { printingId?: string }).printingId
			});
		}
	}

	return [...bySlug.values()].map(({ card, needed, printingId }) => {
		const owned = ownedOfCard(card, ownedOf);
		return {
			card,
			needed,
			owned,
			missing: Math.max(0, needed - owned),
			// Non-null by dataset invariant: every card has at least one printing, asserted at build
			// time (`assertions.ts`). The `??` is for the type, not for a case that can happen.
			addTarget: wantedPrintingId(card, printingId) ?? card.printings[0].id,
			printingsHeld: card.printings.filter((printing) => ownedOf(printing.id) > 0).length
		};
	});
}

/**
 * Which Printing a `−1` should come out of.
 *
 * The add target if it actually holds a copy — so stepping up and back down is symmetrical and
 * touches one row. Otherwise the Printing you hold the **most** of, because the alternative is a
 * `−` that visibly does nothing while the total says you own three: you own the card, you asked to
 * own one fewer, and refusing on a storage technicality would be the wrong answer to the question
 * being asked. `null` when nothing is held anywhere, which is the one case where doing nothing is
 * right.
 */
export function removeTarget(
	row: DeckCollectionRow,
	ownedOf: (printingId: string) => number
): string | null {
	if (ownedOf(row.addTarget) > 0) return row.addTarget;

	let best: string | null = null;
	let bestCount = 0;
	for (const printing of row.card.printings) {
		const count = ownedOf(printing.id);
		if (count > bestCount) {
			best = printing.id;
			bestCount = count;
		}
	}
	return best;
}

/**
 * "Add all to collection", as a set of absolute Printing quantities.
 *
 * **Tops up to what the deck needs** rather than adding the deck's full count: a 3-of you already
 * hold one of contributes `+2`, and a card you hold more of than the deck asks for contributes
 * nothing. Two consequences worth stating, because both were the point:
 *
 * - It is **idempotent**. Pressing it twice changes nothing the second time, because the plan is
 *   computed from the shortfall, which is zero by then. A "add the deck's quantity" version would
 *   double your collection on a double-click.
 * - It is expressed as **absolute quantities**, not deltas — `target = current + missing` — which
 *   is what `collection_items` stores and what makes a retried request safe (see `setQuantity`).
 *
 * Returns an empty map for a deck you can already build, so a caller can use emptiness to mean
 * "nothing to do" rather than checking completeness separately.
 */
export function topUpPlan(
	rows: readonly DeckCollectionRow[],
	ownedOf: (printingId: string) => number
): Map<string, number> {
	const plan = new Map<string, number>();
	for (const row of rows) {
		if (row.missing === 0) continue;
		// Accumulated onto whatever this printing already holds, and onto any earlier row that
		// happens to target the same printing — two cards never share a printing id, but reading the
		// current value from the map first keeps that an observation rather than an assumption.
		const current = plan.get(row.addTarget) ?? ownedOf(row.addTarget);
		plan.set(row.addTarget, current + row.missing);
	}
	return plan;
}

/** Deck-wide totals for the tab's header — distinct cards held in full, and copies still short. */
export function deckCollectionSummary(rows: readonly DeckCollectionRow[]) {
	let cardsComplete = 0;
	let cardsShort = 0;
	let copiesShort = 0;

	for (const row of rows) {
		if (row.missing === 0) cardsComplete += 1;
		else {
			cardsShort += 1;
			copiesShort += row.missing;
		}
	}

	return {
		cards: rows.length,
		cardsComplete,
		cardsShort,
		copiesShort,
		complete: cardsShort === 0
	};
}
