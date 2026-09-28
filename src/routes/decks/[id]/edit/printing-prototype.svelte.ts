/**
 * PROTOTYPE — DELETE ME. Stub state for the printing-choice variant round
 * (`?variant=A|B|C` on this route). See `PROTOTYPE-NOTES.md` in this directory.
 *
 * Deliberately **not** wired to `deck-state.svelte.ts` and never saved: the question is what the
 * interaction should feel like, not whether persistence works. A module-scope singleton so the
 * page, the affordances and variant B's docked pane all see one choice map without prop threading
 * — throwaway code buying a small diff in the real page.
 */
import type { Card, Printing } from '#lib/cards/schema.js';

/** Card slug → chosen printing id. In-memory only; a reload resets it. */
const chosen = $state<Record<string, string>>({});

/** Variant B only: which entry the docked pane is showing. */
let selectedSlug = $state<string | null>(null);

export const printingPrototype = {
	/** The printing a deck entry is currently showing — the choice, or the Default Printing. */
	printingFor(card: Card): Printing {
		const id = chosen[card.slug];
		return card.printings.find((printing) => printing.id === id) ?? card.printings[0];
	},

	indexFor(card: Card): number {
		const printing = this.printingFor(card);
		return card.printings.findIndex((candidate) => candidate.id === printing.id);
	},

	isDefault(card: Card): boolean {
		return chosen[card.slug] === undefined;
	},

	choose(card: Card, printingId: string | null) {
		if (printingId === null) delete chosen[card.slug];
		else chosen[card.slug] = printingId;
	},

	/** Variant C: step through the card's printings, wrapping at both ends. */
	cycle(card: Card, delta: number) {
		const count = card.printings.length;
		const next = (this.indexFor(card) + delta + count) % count;
		chosen[card.slug] = card.printings[next].id;
	},

	get selectedSlug() {
		return selectedSlug;
	},
	select(slug: string | null) {
		selectedSlug = slug;
	}
};
