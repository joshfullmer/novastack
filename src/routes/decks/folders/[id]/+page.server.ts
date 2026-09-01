import { error } from '@sveltejs/kit';
import { getFolder, listDecksInFolder } from '#lib/server/db/folders.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — a specific folder's visibility/content is
// request-scoped and can't be known at build time.
export const prerender = false;

/**
 * The read-only, shareable view of one folder — `.scratch/decklist-folders/issues/01-data-model-
 * and-sharing-semantics.md`. Owner always sees it; a non-owner only if `unlisted`, and even then
 * only the folder's non-private decks — folder sharing never overrides a deck's own privacy. A
 * private folder 404s for a non-owner rather than 403ing, so a guessed id doesn't confirm the
 * folder exists.
 */
export const load: PageServerLoad = async (event) => {
	const folder = await getFolder(event.locals.db, event.params.id);
	if (!folder) return error(404, 'Folder not found');

	const isOwner = event.locals.user?.id === folder.ownerId;
	if (folder.visibility === 'private' && !isOwner) return error(404, 'Folder not found');

	const rows = await listDecksInFolder(event.locals.db, folder.id);
	const visibleRows = isOwner ? rows : rows.filter(({ deck }) => deck.visibility !== 'private');

	return {
		folder: { id: folder.id, name: folder.name, ownerName: folder.ownerName },
		decks: visibleRows.map(({ deck, version }) => ({
			id: deck.id,
			name: deck.name,
			cardCount: version?.entries.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			legendSlugs: version?.legends ?? []
		})),
		// Shared with /decks and /explore — "how I like browsing a list of decks" is one
		// preference, not three.
		deckView: readViewPref(event.cookies, 'decks-list-view', ['list', 'grid'], 'list')
	};
};
