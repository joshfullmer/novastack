/**
 * Where a deck or folder lives, as a URL.
 *
 * One function per surface instead of `/d/{code}` inlined at a dozen call sites, because of the
 * fallback: a row whose `share_code` hasn't been filled yet (see `ensureDeckShareCode`) still has
 * to be linkable, and the honest answer there is the old UUID path — which redirects to the short
 * one as soon as a code exists. Spread across the list pages, that conditional would have been
 * forgotten in at least one of them, and the symptom is a dead link rather than a type error.
 */

/** The canonical, shareable URL for a deck. */
export function deckPath(deck: { id: string; shareCode?: string | null }): string {
	return deck.shareCode ? `/d/${deck.shareCode}` : `/decks/${deck.id}`;
}

/** The canonical, shareable URL for a decklist folder. */
export function folderPath(folder: { id: string; shareCode?: string | null }): string {
	return folder.shareCode ? `/f/${folder.shareCode}` : `/decks/folders/${folder.id}`;
}
