/**
 * Client-side reactive deck state for the deckbuilder screen (`docs/spec/deckbuilder.md` §5).
 * Seeded from a loaded `DeckVersionPayload`, mutated locally, and serialized back to a payload
 * for the save action — the state itself is never persisted directly.
 *
 * Rewritten from the winning prototype (`src/routes/prototype/deckbuilder/deck-state.svelte.ts`)
 * rather than imported from it — prototype code is a thinking aid, not the deliverable. This
 * version delegates the legality math to `#lib/decks/legality.js` instead of reimplementing it.
 */
import { dataset } from '#lib/cards/index.js';
import type { Card } from '#lib/cards/schema.js';
import {
	MAX_COPIES,
	SIDEBOARD_SIZE,
	budgetFromLegends,
	combinedEntries,
	copiesOf,
	deckIssues,
	deckSizeStatus,
	legendNameConflicts,
	notLegalCards,
	ramViolations,
	sideboardStatus,
	type DeckEntry
} from './legality.js';
import type { DeckVersionPayload } from './schema.js';

export const legendCards = dataset.cards.filter((card) => card.cardType === 'Legend');
export const nonLegendCards = dataset.cards.filter((card) => card.cardType !== 'Legend');

export function cardBySlug(slug: string): Card | undefined {
	return dataset.cards.find((card) => card.slug === slug);
}

/** Payload entries → `DeckEntry`s, dropping any slug that has left the dataset. */
function hydrate(payloadEntries: DeckVersionPayload['entries']): DeckEntry[] {
	return payloadEntries
		.map((entry): DeckEntry | null => {
			const card = cardBySlug(entry.cardSlug);
			if (!card) return null;
			// Built rather than spread, so an absent `printingId` stays absent — not present
			// with value `undefined`, which `DeckEntry`'s optional field doesn't consider equal.
			const deckEntry: DeckEntry = { card, quantity: entry.quantity };
			if (entry.printingId !== undefined) deckEntry.printingId = entry.printingId;
			return deckEntry;
		})
		.filter((entry): entry is DeckEntry => entry !== null);
}

const toPayloadEntries = (entries: readonly DeckEntry[]) =>
	entries.map((entry) => ({
		cardSlug: entry.card.slug,
		quantity: entry.quantity,
		printingId: entry.printingId
	}));

export function createDeckState(initial?: DeckVersionPayload) {
	let legends = $state<Card[]>(
		(initial?.legends ?? [])
			.map((legend) => cardBySlug(legend.cardSlug))
			.filter((card): card is Card => card !== undefined)
	);

	/**
	 * Legend slug → chosen Printing id.
	 *
	 * A record beside `legends` rather than a `{ card, printingId }` pair *in* it, because
	 * `legends` is `Card[]` and every consumer wants it that way — `budgetFromLegends`,
	 * `legendNameConflicts`, `notLegalCards`, the export image, and a dozen bits of markup. Pairing
	 * it up would have rippled `.card` through all of them to store one optional string.
	 *
	 * The cost is that this can drift from `legends`, so `setLegend` is the only thing that writes
	 * the array and it prunes here in the same breath. `toPayload` reads the two together.
	 */
	const legendPrintings = $state<Record<string, string>>(
		Object.fromEntries(
			(initial?.legends ?? [])
				.filter((legend) => legend.printingId !== undefined)
				.map((legend) => [legend.cardSlug, legend.printingId as string])
		)
	);
	const entries = $state<DeckEntry[]>(hydrate(initial?.entries ?? []));
	const sideboard = $state<DeckEntry[]>(hydrate(initial?.sideboard ?? []));

	const budget = $derived(budgetFromLegends(legends));
	const totalCards = $derived(entries.reduce((sum, entry) => sum + entry.quantity, 0));
	const sizeStatus = $derived(deckSizeStatus(totalCards));
	const sideboardCards = $derived(sideboard.reduce((sum, entry) => sum + entry.quantity, 0));
	const sideboardState = $derived(sideboardStatus(sideboardCards));
	/** The deck-wide rules run over both piles at once — see `combinedEntries`. */
	const combined = $derived(combinedEntries(entries, sideboard));
	const violations = $derived(ramViolations(combined, budget));
	const nameConflicts = $derived(legendNameConflicts(legends));
	const notLegal = $derived(notLegalCards(legends, combined));
	const sideboardLegends = $derived(
		sideboard.filter((entry) => entry.card.cardType === 'Legend').map((entry) => entry.card)
	);
	const issues = $derived(
		deckIssues({
			totalCards,
			sizeStatus,
			sideboardCards,
			sideboardStatus: sideboardState,
			sideboardLegends,
			violations,
			nameConflicts,
			notLegal
		})
	);

	function quantityOf(card: Card): number {
		return entries.find((entry) => entry.card.slug === card.slug)?.quantity ?? 0;
	}

	function sideboardQuantityOf(card: Card): number {
		return sideboard.find((entry) => entry.card.slug === card.slug)?.quantity ?? 0;
	}

	/** Only the copy limit blocks — see `legality.ts`'s own doc comment for why. Counted across
	 * both piles (`copiesOf`), so a card at 3 in the main deck can't also be sideboarded. */
	function canAddCopy(card: Card): boolean {
		return copiesOf(card, entries, sideboard) < MAX_COPIES;
	}

	/**
	 * The copy cap, plus the two rules specific to the 7: it's full at `SIDEBOARD_SIZE` (blocked
	 * for the same reason a 4th copy is — an 8th card is noise, not a state worth representing),
	 * and Legends may never go there (tournament rules §3.4.4).
	 */
	function canAddToSideboard(card: Card): boolean {
		if (card.cardType === 'Legend') return false;
		if (sideboardCards >= SIDEBOARD_SIZE) return false;
		return canAddCopy(card);
	}

	/** One `add`/`remove` pair per pile rather than a `target` parameter — which pile a click
	 * fills is the editor's own view state (it has a visible toggle for it), not something this
	 * model should hold a second copy of. */
	function addCard(card: Card) {
		if (!canAddCopy(card)) return;
		const existing = entries.find((entry) => entry.card.slug === card.slug);
		if (existing) existing.quantity += 1;
		else entries.push({ card, quantity: 1 });
	}

	function removeCard(card: Card) {
		const index = entries.findIndex((entry) => entry.card.slug === card.slug);
		if (index === -1) return;
		entries[index].quantity -= 1;
		if (entries[index].quantity <= 0) entries.splice(index, 1);
	}

	function addToSideboard(card: Card) {
		if (!canAddToSideboard(card)) return;
		const existing = sideboard.find((entry) => entry.card.slug === card.slug);
		if (existing) existing.quantity += 1;
		else sideboard.push({ card, quantity: 1 });
	}

	function removeFromSideboard(card: Card) {
		const index = sideboard.findIndex((entry) => entry.card.slug === card.slug);
		if (index === -1) return;
		sideboard[index].quantity -= 1;
		if (sideboard[index].quantity <= 0) sideboard.splice(index, 1);
	}

	/**
	 * Picks which Printing this deck's copies of a Card use — `null` returns it to the Card's
	 * Default Printing (`#lib/decks/printing.ts`).
	 *
	 * Applied to **both piles**, not the one the caller happened to be looking at. A Card in the
	 * main deck and the sideboard is the same card in the same deck; two printings of it would be a
	 * distinction the decklist can't express and nobody asked for. The property this keeps is the
	 * one `combinedEntries` already assumes — see its note on dropping `printingId` when two piles
	 * disagree, which can now only happen to data written before this existed.
	 *
	 * Deletes rather than assigns `undefined`: an absent key is what "following the default" means
	 * on the wire, and `DeckEntrySchema`'s optional field doesn't treat the two as equal.
	 */
	function setPrinting(card: Card, printingId: string | null) {
		for (const pile of [entries, sideboard]) {
			const entry = pile.find((candidate) => candidate.card.slug === card.slug);
			if (!entry) continue;
			if (printingId === null) delete entry.printingId;
			else entry.printingId = printingId;
		}

		// Legends live in slots rather than piles, but "which printing of this card does the deck
		// use" is one question, so one function answers it for both.
		if (legends.some((legend) => legend.slug === card.slug)) {
			if (printingId === null) delete legendPrintings[card.slug];
			else legendPrintings[card.slug] = printingId;
		}
	}

	/** The Printing id this deck has chosen for a Card, or `undefined` for the default. */
	function printingIdOf(card: Card): string | undefined {
		const entry =
			entries.find((candidate) => candidate.card.slug === card.slug) ??
			sideboard.find((candidate) => candidate.card.slug === card.slug);
		return entry?.printingId ?? legendPrintings[card.slug];
	}

	function setLegend(slot: number, card: Card | null) {
		const next = [...legends];
		// Whatever is leaving this slot takes its printing choice with it — otherwise a Legend
		// swapped out and later swapped back would silently resurrect a printing nobody re-picked,
		// and `toPayload` would carry an entry for a card the deck no longer names.
		const leaving = legends[slot];
		if (leaving && leaving.slug !== card?.slug) delete legendPrintings[leaving.slug];

		if (card === null) next.splice(slot, 1);
		else next[slot] = card;
		legends = next.filter((value): value is Card => value !== undefined);
	}

	function toPayload(): DeckVersionPayload {
		return {
			entries: toPayloadEntries(entries),
			// Always the object form, never a bare slug: the reader accepts both (`LegendEntrySchema`)
			// but there is no reason to keep writing the shape that can't hold a printing.
			legends: legends.map((legend) => {
				const printingId = legendPrintings[legend.slug];
				return printingId === undefined
					? { cardSlug: legend.slug }
					: { cardSlug: legend.slug, printingId };
			}),
			sideboard: toPayloadEntries(sideboard)
		};
	}

	return {
		get legends() {
			return legends;
		},
		get entries() {
			return entries;
		},
		get sideboard() {
			return sideboard;
		},
		get budget() {
			return budget;
		},
		get totalCards() {
			return totalCards;
		},
		get sizeStatus() {
			return sizeStatus;
		},
		get sideboardCards() {
			return sideboardCards;
		},
		get sideboardStatus() {
			return sideboardState;
		},
		get ramViolations() {
			return violations;
		},
		get isRamLegal() {
			return violations.length === 0;
		},
		get legendNameConflicts() {
			return nameConflicts;
		},
		get issues() {
			return issues;
		},
		quantityOf,
		sideboardQuantityOf,
		canAddCopy,
		canAddToSideboard,
		addCard,
		removeCard,
		addToSideboard,
		removeFromSideboard,
		setPrinting,
		printingIdOf,
		setLegend,
		toPayload
	};
}

export type DeckState = ReturnType<typeof createDeckState>;
