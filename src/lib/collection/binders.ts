/**
 * Binder shape shared between client and server.
 *
 * `POCKETS_PER_PAGE` lives here rather than in `#lib/server/db/binders.ts` because the UI needs it
 * to render a Page and SvelteKit rightly refuses to let client code import from `lib/server`.
 *
 * Nine is the 3×3 sheet the official binders use. The Kickstarter also sold a 2×2 toploader
 * binder, so a per-Binder layout is a real possibility later — it would arrive as a column on
 * `printing_lists`, which is why this is a named constant rather than a literal `9` sprinkled
 * through the markup.
 */
export const POCKETS_PER_PAGE = 9;

/** A Binder as the list screen needs it: identity, plus enough to render a cover and a count. */
export type BinderSummary = {
	id: string;
	name: string;
	visibility: 'private' | 'shared';
	/** Pockets holding a card, across every page. */
	filled: number;
	/** Always at least 1 — an empty Binder is one empty Page, not zero pages. */
	pageCount: number;
	/** The first filled Pocket in reading order, used as the cover. `null` for an empty Binder. */
	coverPrintingId: string | null;
};
