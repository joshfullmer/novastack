/**
 * The Deck view's **Collection** tab — reconciling a decklist against what the viewer owns.
 *
 * `missing.ts` answers "what am I short of", which is a *report*. This answers the editing question
 * next to it: for every card in the list, how many do I hold, which Printing does a change write
 * to, and what would "add everything I'm missing" actually do? Kept pure and separate from the
 * component for the usual reason — the arithmetic is where the bugs are, and none of it needs a
 * browser to test.
 *
 * ## Two questions, and which one each row asks
 *
 * "Do I own this card?" and "do I own *this printing* of it?" have different answers, and picking
 * one globally makes the tab lie half the time. So each row asks **whichever question the deck
 * itself implies**:
 *
 * - The deck **named a Printing** → the row is scoped to it. Choosing art is a statement that the
 *   art matters, so `0/3` against three English copies is the honest reading, and the row says how
 *   many you hold elsewhere so the number is never mysterious.
 * - The deck named none → Card level, summed across every Printing, exactly as before. Any copy
 *   plays, and nobody expressed a preference to hold them to.
 *
 * Deliberately driven by the deck's data and **not** by the viewer's entitlement. A deck whose
 * owner's `choose-printing` grant has lapsed still names those printings and still renders them
 * (`carry-printings.ts`), so the checklist should keep tracking them; numbers that silently
 * re-scoped when a subscription ended would be the worse surprise.
 *
 * The tab's **headline stays Card level** either way — see `deckCollectionSummary`.
 */
import type { Card } from '#lib/cards/schema.js';
import { ownedOfCard, wantedPrintingId, type NeededCard } from './missing.js';

export type DeckCollectionRow = {
	card: Card;
	/** Copies the deck asks for, summed across entries naming the same card. */
	needed: number;
	/** `printing` when the deck named one, `card` when it didn't — see the module comment. */
	scope: 'printing' | 'card';
	/** Copies held **within the row's scope**: of the chosen Printing, or across all of them. */
	owned: number;
	/** `needed - owned` within scope, floored at zero. What the row displays. */
	missing: number;
	/** Copies held outside the scope. Always 0 for a Card-level row; the disclosure that keeps a
	 * scoped `0/3` from looking like a bug when you hold three in another printing. */
	ownedElsewhere: number;
	/** Copies held across every Printing — what "can I field this deck" counts. */
	playableOwned: number;
	/** Card-level shortfall, ignoring which Printing. Drives the headline and matches `/explore`. */
	playableMissing: number;
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
 * Entries naming the same card are summed — a deck may list a card twice — and the **first** entry's
 * Printing wins the scope, since `setPrinting` keeps a card's printing identical across both piles
 * and only data written before that existed can disagree.
 */
export function deckCollectionRows(
	entries: readonly NeededCard[],
	ownedOf: (printingId: string) => number
): DeckCollectionRow[] {
	const bySlug = new Map<string, { card: Card; needed: number; printingId?: string }>();

	for (const entry of entries) {
		const existing = bySlug.get(entry.card.slug);
		if (existing) {
			existing.needed += entry.quantity;
			existing.printingId ??= entry.printingId;
		} else {
			bySlug.set(entry.card.slug, {
				card: entry.card,
				needed: entry.quantity,
				printingId: entry.printingId
			});
		}
	}

	return [...bySlug.values()].map(({ card, needed, printingId }) => {
		const playableOwned = ownedOfCard(card, ownedOf);
		// Non-null by dataset invariant: every card has at least one printing, asserted at build
		// time (`assertions.ts`). The `??` is for the type, not for a case that can happen.
		const addTarget = wantedPrintingId(card, printingId) ?? card.printings[0].id;
		// Scoped only when the deck actually named a Printing *and* that printing still exists —
		// `wantedPrintingId` falls back to the default for an id that has left the dataset, and a
		// deck following the default is not making a statement about art.
		const scoped = printingId !== undefined && addTarget === printingId;

		const owned = scoped ? ownedOf(addTarget) : playableOwned;

		return {
			card,
			needed,
			scope: scoped ? 'printing' : 'card',
			owned,
			missing: Math.max(0, needed - owned),
			ownedElsewhere: scoped ? playableOwned - owned : 0,
			playableOwned,
			playableMissing: Math.max(0, needed - playableOwned),
			addTarget,
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
 * being asked.
 *
 * A **scoped** row never reaches for another Printing, though: its number only counts the chosen
 * one, so taking a copy off some other printing would decrement a figure the row isn't showing.
 * `null` when there is nothing to take, which is the one case where doing nothing is right.
 */
export function removeTarget(
	row: DeckCollectionRow,
	ownedOf: (printingId: string) => number
): string | null {
	if (ownedOf(row.addTarget) > 0) return row.addTarget;
	if (row.scope === 'printing') return null;

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
 * **Tops up to what each row is short of, in that row's own scope.** For a Card-level row that's
 * the familiar behaviour; for a scoped row it buys the art the deck asked for, which is the point
 * of having asked — so a deck wanting 3 French copies adds 3 French even if you hold English ones.
 * That does increase your total copy count past what the deck needs to be playable, and it is what
 * the row said it would do.
 *
 * Two properties worth keeping:
 *
 * - It is **idempotent**. Pressing twice changes nothing the second time, because the plan is
 *   computed from the shortfall, which is zero by then.
 * - It is expressed as **absolute quantities**, not deltas — `target = current + missing` — which
 *   is what `collection_items` stores and what makes a retried request safe (see `setQuantity`).
 *
 * Returns an empty map when nothing is short, so a caller can use emptiness to mean "nothing to do".
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

/**
 * Deck-wide totals for the tab's header.
 *
 * **Card level, always** — "you're missing 7 cards" answers "can I field this deck", which is what
 * `/explore`'s per-deck count and the query language's `owned:` rollup also mean, and what somebody
 * glancing at a decklist is asking. Printing detail belongs on the rows, where there's room to say
 * *which* printing and how many you hold elsewhere.
 *
 * `printingShortfallCards` is the one bridge between the two: it lets the header admit "you own
 * every card, but one isn't in the printing you chose" instead of leaving a complete-looking deck
 * sitting above a row that reads `0/3`.
 */
export function deckCollectionSummary(rows: readonly DeckCollectionRow[]) {
	let cardsComplete = 0;
	let cardsShort = 0;
	let copiesShort = 0;
	let printingShortfallCards = 0;

	for (const row of rows) {
		if (row.playableMissing === 0) cardsComplete += 1;
		else {
			cardsShort += 1;
			copiesShort += row.playableMissing;
		}
		// Short of the chosen art while holding enough playable copies — the case the header would
		// otherwise contradict.
		if (row.playableMissing === 0 && row.missing > 0) printingShortfallCards += 1;
	}

	return {
		cards: rows.length,
		cardsComplete,
		cardsShort,
		copiesShort,
		printingShortfallCards,
		complete: cardsShort === 0
	};
}
