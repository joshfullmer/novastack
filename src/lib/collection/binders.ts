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

/** A Binder as the list screen needs it: identity, a count, and its first Page to show. */
export type BinderSummary = {
	id: string;
	name: string;
	visibility: 'private' | 'shared';
	/** Pockets holding a card, across every page. */
	filled: number;
	/** Always at least 1 — an empty Binder is one empty Page, not zero pages. */
	pageCount: number;
	/**
	 * Page 1 in full — `POCKETS_PER_PAGE` entries, `null` where a Pocket is empty.
	 *
	 * The whole page rather than one cover card: what a Binder *is* is an arrangement, and a single
	 * card says nothing about it. Two binders whose first card matches look identical under a cover;
	 * under a page they don't. Gaps are shown for the same reason they're kept everywhere else —
	 * a held space is part of the arrangement.
	 */
	firstPage: (string | null)[];
};
