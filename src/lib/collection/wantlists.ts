/**
 * Wantlist shapes shared between client and server.
 *
 * Here rather than in `#lib/server/db/wantlists.ts` for the same reason `#lib/collection/binders.ts`
 * exists: the deck view's Missing panel needs this type, and SvelteKit rightly refuses to let
 * client code import from `lib/server` — including for types, which would work at runtime and
 * still be the wrong dependency to declare.
 */

/** A Wantlist as any list screen needs it: identity, plus how much is on it. */
export type WantlistSummary = {
	id: string;
	name: string;
	visibility: 'private' | 'shared';
	/** Distinct Printings wanted. */
	entries: number;
	/** Copies wanted across them, which is the number that tells you the size of the ask. */
	copies: number;
	/**
	 * The list other surfaces add to without asking — at most one per user.
	 *
	 * The collection view's "want this" button needs a destination it doesn't have to ask about
	 * every time, and picking silently (the newest? the biggest?) would put cards somewhere the
	 * owner didn't choose. So the choice is theirs, once, and stored (`printing_lists.is_default`).
	 */
	isDefault: boolean;
};
