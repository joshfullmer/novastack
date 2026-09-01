/**
 * Decklist Folders data access (`.scratch/decklist-folders/map.md`) — a user's own grouping of
 * their decks, independent of deck visibility. See `schema.ts` for the shape.
 */
import { eq } from 'drizzle-orm';
import { getLatestVersion } from './decks.js';
import type { getDb } from './index.js';
import { deckFolders, decks, user } from './schema.js';

type Db = ReturnType<typeof getDb>;
type FolderVisibility = NonNullable<(typeof deckFolders.$inferInsert)['visibility']>;

export async function listFoldersForOwner(db: Db, ownerId: string) {
	return db.select().from(deckFolders).where(eq(deckFolders.ownerId, ownerId));
}

export async function getFolder(db: Db, folderId: string) {
	const [row] = await db
		.select({ folder: deckFolders, ownerName: user.name })
		.from(deckFolders)
		.innerJoin(user, eq(user.id, deckFolders.ownerId))
		.where(eq(deckFolders.id, folderId));
	return row ? { ...row.folder, ownerName: row.ownerName } : null;
}

export async function createFolder(db: Db, ownerId: string, name: string) {
	const [folder] = await db.insert(deckFolders).values({ ownerId, name }).returning();
	return folder;
}

export async function renameFolder(db: Db, folderId: string, name: string) {
	await db.update(deckFolders).set({ name }).where(eq(deckFolders.id, folderId));
}

export async function setFolderVisibility(db: Db, folderId: string, visibility: FolderVisibility) {
	await db.update(deckFolders).set({ visibility }).where(eq(deckFolders.id, folderId));
}

/** Un-groups every deck in the folder before deleting it — done explicitly rather than relying
 * on `decks.folder_id`'s `ON DELETE SET NULL`, since that column was added via `ALTER TABLE ADD
 * COLUMN` (migration 0004), which SQLite doesn't carry FK actions through as reliably as a
 * `CREATE TABLE` column. */
export async function deleteFolder(db: Db, folderId: string) {
	await db.update(decks).set({ folderId: null }).where(eq(decks.folderId, folderId));
	await db.delete(deckFolders).where(eq(deckFolders.id, folderId));
}

export async function moveDeckToFolder(db: Db, deckId: string, folderId: string | null) {
	await db.update(decks).set({ folderId }).where(eq(decks.id, deckId));
}

/** Every deck in the folder, any visibility — the shared-folder route (`/decks/folders/[id]`)
 * filters out `private` ones itself for a non-owner viewer, mirroring how `/decks/[id]` gates a
 * single deck's own `load`, rather than parameterizing the query. */
export async function listDecksInFolder(db: Db, folderId: string) {
	const rows = await db.select().from(decks).where(eq(decks.folderId, folderId));
	return Promise.all(rows.map(async (deck) => ({ deck, version: await getLatestVersion(db, deck.id) })));
}
