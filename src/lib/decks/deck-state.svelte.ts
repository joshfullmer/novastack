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
	budgetFromLegends,
	deckIssues,
	deckSizeStatus,
	legendNameConflicts,
	ramViolations,
	type DeckEntry
} from './legality.js';
import type { DeckVersionPayload } from './schema.js';

export const legendCards = dataset.cards.filter((card) => card.cardType === 'Legend');
export const nonLegendCards = dataset.cards.filter((card) => card.cardType !== 'Legend');

export function cardBySlug(slug: string): Card | undefined {
	return dataset.cards.find((card) => card.slug === slug);
}

export function createDeckState(initial?: DeckVersionPayload) {
	let legends = $state<Card[]>(
		(initial?.legends ?? [])
			.map((slug) => cardBySlug(slug))
			.filter((card): card is Card => card !== undefined)
	);
	const entries = $state<DeckEntry[]>(
		(initial?.entries ?? [])
			.map((entry): DeckEntry | null => {
				const card = cardBySlug(entry.cardSlug);
				if (!card) return null;
				// Built rather than spread, so an absent `printingId` stays absent — not present
				// with value `undefined`, which `DeckEntry`'s optional field doesn't consider equal.
				const deckEntry: DeckEntry = { card, quantity: entry.quantity };
				if (entry.printingId !== undefined) deckEntry.printingId = entry.printingId;
				return deckEntry;
			})
			.filter((entry): entry is DeckEntry => entry !== null)
	);

	const budget = $derived(budgetFromLegends(legends));
	const totalCards = $derived(entries.reduce((sum, entry) => sum + entry.quantity, 0));
	const sizeStatus = $derived(deckSizeStatus(totalCards));
	const violations = $derived(ramViolations(entries, budget));
	const nameConflicts = $derived(legendNameConflicts(legends));
	const issues = $derived(deckIssues({ totalCards, sizeStatus, violations, nameConflicts }));

	function quantityOf(card: Card): number {
		return entries.find((entry) => entry.card.slug === card.slug)?.quantity ?? 0;
	}

	/** Only the copy limit blocks — see `legality.ts`'s own doc comment for why. */
	function canAddCopy(card: Card): boolean {
		return quantityOf(card) < MAX_COPIES;
	}

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

	function setLegend(slot: number, card: Card | null) {
		const next = [...legends];
		if (card === null) next.splice(slot, 1);
		else next[slot] = card;
		legends = next.filter((value): value is Card => value !== undefined);
	}

	function toPayload(): DeckVersionPayload {
		return {
			entries: entries.map((entry) => ({
				cardSlug: entry.card.slug,
				quantity: entry.quantity,
				printingId: entry.printingId
			})),
			legends: legends.map((legend) => legend.slug)
		};
	}

	return {
		get legends() {
			return legends;
		},
		get entries() {
			return entries;
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
		canAddCopy,
		addCard,
		removeCard,
		setLegend,
		toPayload
	};
}

export type DeckState = ReturnType<typeof createDeckState>;
