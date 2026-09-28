/**
 * Allocating and healing **share codes** — the short public ids behind `/d`, `/f` and `/l`
 * (`#lib/short-id.ts` explains the format and why they exist alongside the UUID keys).
 *
 * Three tables carry one, and the rules are identical for all three, so the uniqueness dance lives
 * here once rather than in each table's own module.
 *
 * Two entry points, for the two moments a code is needed:
 *
 * - `freshCodeFor` — at insert time, for anything created from now on.
 * - `ensure*ShareCode` — lazily, for a row that somehow has none. Migration 0011 backfills every
 *   existing row, so this should never fire in practice; it exists because "should never" isn't
 *   "cannot", and the failure it prevents is a deck with no shareable URL, which is worse than an
 *   extra write on a cold path. A row created by an older Worker in the window between migrating
 *   and deploying is the concrete case.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { randomShareCode } from '#lib/short-id.js';
import type { getDb } from './index.js';
import { deckFolders, decks, printingLists } from './schema.js';

type Db = ReturnType<typeof getDb>;

/**
 * Draws before giving up. Each draw is 1-in-2⁵⁰ to collide at this scale, so five is already
 * theatre — but an unbounded loop against a database is the kind of thing that turns a bad index
 * into a hung Worker, and a thrown error is easier to diagnose than a spin.
 */
const MAX_ATTEMPTS = 5;

/** Whether any row already holds this code. Takes the column so all three tables share it. */
async function taken(db: Db, column: SQLiteColumn, code: string): Promise<boolean> {
	const rows = await db
		.select({ found: sql<number>`1` })
		.from(column.table)
		.where(eq(column, code))
		.limit(1);
	return rows.length > 0;
}

/**
 * A code not currently held in `column`.
 *
 * Checked rather than trusted-then-caught, because the caller is usually an `INSERT` that would
 * otherwise fail on the unique index and lose the whole row (a new deck, say). The index is still
 * the real guarantee — this only makes hitting it essentially impossible.
 */
export async function freshCodeFor(db: Db, column: SQLiteColumn): Promise<string> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		const code = randomShareCode();
		if (!(await taken(db, column, code))) return code;
	}
	throw new Error('Could not allocate a unique share code');
}

/**
 * Fills a missing code, and returns whatever the row ends up holding.
 *
 * `WHERE ... AND share_code IS NULL` plus a re-read is what makes two concurrent requests safe: the
 * second one's update matches no rows, and the re-read hands it the winner's code instead of the
 * one it drew. Without that, two tabs opening the same codeless deck could each render a different
 * "canonical" URL, one of which never resolves.
 */
async function ensureShareCode(
	db: Db,
	idColumn: SQLiteColumn,
	codeColumn: SQLiteColumn,
	id: string,
	current: string | null
): Promise<string> {
	if (current) return current;

	const code = await freshCodeFor(db, codeColumn);
	await db
		.update(codeColumn.table)
		.set({ [codeColumn.name]: code })
		.where(and(eq(idColumn, id), isNull(codeColumn)));

	const [row] = await db
		.select({ code: codeColumn })
		.from(codeColumn.table)
		.where(eq(idColumn, id))
		.limit(1);
	return (row?.code as string | null) ?? code;
}

export function freshDeckShareCode(db: Db): Promise<string> {
	return freshCodeFor(db, decks.shareCode);
}

export function freshFolderShareCode(db: Db): Promise<string> {
	return freshCodeFor(db, deckFolders.shareCode);
}

export function freshListShareCode(db: Db): Promise<string> {
	return freshCodeFor(db, printingLists.shareCode);
}

export function ensureDeckShareCode(
	db: Db,
	deck: { id: string; shareCode: string | null }
): Promise<string> {
	return ensureShareCode(db, decks.id, decks.shareCode, deck.id, deck.shareCode);
}

export function ensureFolderShareCode(
	db: Db,
	folder: { id: string; shareCode: string | null }
): Promise<string> {
	return ensureShareCode(db, deckFolders.id, deckFolders.shareCode, folder.id, folder.shareCode);
}

export function ensureListShareCode(
	db: Db,
	list: { id: string; shareCode: string | null }
): Promise<string> {
	return ensureShareCode(db, printingLists.id, printingLists.shareCode, list.id, list.shareCode);
}
