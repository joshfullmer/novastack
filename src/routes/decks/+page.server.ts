import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	deleteDeck,
	duplicateDeck,
	getDeck,
	listDecksForOwner,
	renameDeck,
	setDeckVisibility
} from '#lib/server/db/decks.js';
import {
	createFolder,
	deleteFolder,
	getFolder,
	listFoldersForOwner,
	moveDeckToFolder,
	renameFolder,
	setFolderVisibility
} from '#lib/server/db/folders.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this reads request-scoped session/DB state.
export const prerender = false;

const VisibilitySchema = v.picklist(['public', 'unlisted', 'private']);
const FolderVisibilitySchema = v.picklist(['private', 'unlisted']);

/** Every row action targets a deck by id from form data — verified owned here so a crafted
 * request can't rename/delete/duplicate someone else's deck. */
async function requireOwnedDeck(event: {
	locals: App.Locals;
	request: Request;
}): Promise<{ deckId: string; userId: string; formData: FormData }> {
	if (!event.locals.user) return redirect(302, '/auth/login');
	const userId = event.locals.user.id;

	const formData = await event.request.formData();
	const deckId = formData.get('deckId');
	if (typeof deckId !== 'string') return error(400, 'Missing deckId');

	const deck = await getDeck(event.locals.db, deckId);
	if (!deck) return error(404, 'Deck not found');
	if (deck.ownerId !== userId) return error(403, 'Not your deck');

	return { deckId, userId, formData };
}

/** Mirrors `requireOwnedDeck` for folders — every folder action targets one by id from form
 * data, verified owned here so a crafted request can't rename/delete/reshare someone else's. */
async function requireOwnedFolder(event: {
	locals: App.Locals;
	request: Request;
}): Promise<{ folderId: string; userId: string; formData: FormData }> {
	if (!event.locals.user) return redirect(302, '/auth/login');
	const userId = event.locals.user.id;

	const formData = await event.request.formData();
	const folderId = formData.get('folderId');
	if (typeof folderId !== 'string') return error(400, 'Missing folderId');

	const folder = await getFolder(event.locals.db, folderId);
	if (!folder) return error(404, 'Folder not found');
	if (folder.ownerId !== userId) return error(403, 'Not your folder');

	return { folderId, userId, formData };
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');

	const owned = await listDecksForOwner(event.locals.db, event.locals.user.id);
	const folders = await listFoldersForOwner(event.locals.db, event.locals.user.id);

	return {
		decks: owned.map(({ deck, version }) => ({
			id: deck.id,
			name: deck.name,
			visibility: deck.visibility,
			folderId: deck.folderId,
			cardCount: version?.entries.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			legendSlugs: version?.legends ?? [],
			savedAt: version?.savedAt ?? null
		})),
		folders: folders.map((folder) => ({
			id: folder.id,
			name: folder.name,
			visibility: folder.visibility
		})),
		// Shared with /explore — "how I like browsing a list of decks" is one preference, not two.
		deckView: readViewPref(event.cookies, 'decks-list-view', ['list', 'grid'], 'list')
	};
};

export const actions: Actions = {
	rename: async (event) => {
		const { deckId, formData } = await requireOwnedDeck(event);
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Deck name cannot be empty' });
		}
		await renameDeck(event.locals.db, deckId, name.trim());
	},

	visibility: async (event) => {
		const { deckId, formData } = await requireOwnedDeck(event);
		let visibility;
		try {
			visibility = v.parse(VisibilitySchema, formData.get('visibility'));
		} catch {
			return fail(400, { message: 'Invalid visibility' });
		}
		await setDeckVisibility(event.locals.db, deckId, visibility);
	},

	duplicate: async (event) => {
		const { deckId, userId } = await requireOwnedDeck(event);
		await duplicateDeck(event.locals.db, deckId, userId);
	},

	delete: async (event) => {
		const { deckId } = await requireOwnedDeck(event);
		await deleteDeck(event.locals.db, deckId);
	},

	move: async (event) => {
		const { deckId, userId, formData } = await requireOwnedDeck(event);
		const rawFolderId = formData.get('folderId');
		const folderId = typeof rawFolderId === 'string' && rawFolderId !== '' ? rawFolderId : null;
		if (folderId) {
			const folder = await getFolder(event.locals.db, folderId);
			if (!folder || folder.ownerId !== userId) return error(403, 'Not your folder');
		}
		await moveDeckToFolder(event.locals.db, deckId, folderId);
	},

	createFolder: async (event) => {
		if (!event.locals.user) return redirect(302, '/auth/login');
		const formData = await event.request.formData();
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Folder name cannot be empty' });
		}
		await createFolder(event.locals.db, event.locals.user.id, name.trim());
	},

	renameFolder: async (event) => {
		const { folderId, formData } = await requireOwnedFolder(event);
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Folder name cannot be empty' });
		}
		await renameFolder(event.locals.db, folderId, name.trim());
	},

	folderVisibility: async (event) => {
		const { folderId, formData } = await requireOwnedFolder(event);
		let visibility;
		try {
			visibility = v.parse(FolderVisibilitySchema, formData.get('visibility'));
		} catch {
			return fail(400, { message: 'Invalid visibility' });
		}
		await setFolderVisibility(event.locals.db, folderId, visibility);
	},

	deleteFolder: async (event) => {
		const { folderId } = await requireOwnedFolder(event);
		await deleteFolder(event.locals.db, folderId);
	}
};
