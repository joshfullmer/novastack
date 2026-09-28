/**
 * PROTOTYPE — DELETE ME. Stub state for the printing-choice variant round
 * (`?variant=D|E|F` on this route). See `PROTOTYPE-NOTES-2.md` in this directory.
 *
 * Holds only the **printing choice**, which is the thing with no home in the real model yet.
 * Copy counts deliberately go through the real `deck-state.svelte.ts` instead: the editor's deck
 * state is already local and unsaved until "Save deck", so a modal's `+1` behaving exactly like
 * the grid's `+1` costs nothing and makes the round honest about how the two interact.
 *
 * A module-scope singleton so the page, the affordances and the modal all see one choice map
 * without prop threading — throwaway code buying a small diff in the real page.
 */
import type { Card, Printing } from '#lib/cards/schema.js';

/** Card slug → chosen printing id. In-memory only; a reload resets it. */
const chosen = $state<Record<string, string>>({});

/** Which entry the management modal is open on (variants D and F). */
let managing = $state<string | null>(null);

export const printingPrototype = {
	/** The printing a deck entry is currently showing — the choice, or the Default Printing. */
	printingFor(card: Card): Printing {
		const id = chosen[card.slug];
		return card.printings.find((printing) => printing.id === id) ?? card.printings[0];
	},

	isDefault(card: Card): boolean {
		return chosen[card.slug] === undefined;
	},

	choose(card: Card, printingId: string | null) {
		if (printingId === null) delete chosen[card.slug];
		else chosen[card.slug] = printingId;
	},

	/** Variant E: step through the card's printings in place, wrapping at both ends. */
	cycle(card: Card, delta: number) {
		const printings = card.printings;
		const current = this.printingFor(card);
		const index = printings.findIndex((candidate) => candidate.id === current.id);
		chosen[card.slug] = printings[(index + delta + printings.length) % printings.length].id;
	},

	get managing() {
		return managing;
	},
	manage(slug: string | null) {
		managing = slug;
	}
};
