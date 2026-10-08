import { error, redirect } from '@sveltejs/kit';
import { legendRefsFromJson } from '#lib/decks/schema.js';
import { getFolderByRef, listDecksInFolder } from '#lib/server/db/folders.js';
import { ensureFolderShareCode } from '#lib/server/db/share-codes.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — a specific folder's visibility/content is
// request-scoped and can't be known at build time.
export const prerender = false;

/**
 * The read-only, shareable view of one folder — `.scratch/decklist-folders/issues/01-data-model-
 * and-sharing-semantics.md`. Owner always sees it; a non-owner only if `shared`, and even then
 * only the folder's non-private decks — folder sharing never overrides a deck's own privacy. A
 * private folder 404s for a non-owner rather than 403ing, so a guessed id doesn't confirm the
 * folder exists.
 *
 * **The canonical URL for a folder**, reached by its share code; `/decks/folders/[id]` permanently
 * redirects here for links shared before codes existed.
 */
export const load: PageServerLoad = async (event) => {
	const folder = await getFolderByRef(event.locals.db, event.params.code);
	if (!folder) return error(404, 'Folder not found');

	const shareCode = await ensureFolderShareCode(event.locals.db, folder);
	if (event.params.code !== shareCode) return redirect(301, `/f/${shareCode}`);

	const isOwner = event.locals.user?.id === folder.ownerId;
	if (folder.visibility === 'private' && !isOwner) return error(404, 'Folder not found');

	const rows = await listDecksInFolder(event.locals.db, folder.id);
	const visibleRows = isOwner ? rows : rows.filter(({ deck }) => deck.visibility !== 'private');

	return {
		folder: { id: folder.id, shareCode, name: folder.name, ownerName: folder.ownerName },
		decks: visibleRows.map(({ deck, version }) => ({
			id: deck.id,
			shareCode: deck.shareCode,
			name: deck.name,
			cardCount: version?.entries.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			/** Separate from `cardCount` — 40–50 is the main deck's range, not the deck's total. */
			sideboardCards: version?.sideboard.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			legends: legendRefsFromJson(version?.legends)
		})),
		// Shared with /decks and /explore — "how I like browsing a list of decks" is one
		// preference, not three.
		deckView: readViewPref(event.cookies, 'decks-list-view', ['list', 'grid'], 'grid')
	};
};
