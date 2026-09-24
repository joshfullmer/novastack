/**
 * Collection data access — the only place route code touches `collection_items` directly, the
 * same convention `decks.ts` and `folders.ts` follow.
 *
 * The model is `docs/adr/0003-the-collection-is-flat-and-binders-are-showcases.md`: one flat,
 * unnamed, always-private Collection per user, a quantity per Printing. There is no owner check to
 * make here the way `requireOwnedDeck` does for decks — a Collection has no id to forge, so every
 * function below takes the session's `userId` and can only ever touch that user's rows.
 *
 * **Printing ids are not validated against the dataset here.** `cards.json` is a client/route-side
 * artifact and this module is the DB boundary; the route that calls `setQuantity` is what rejects
 * an unknown printing (see `routes/api/collection/+server.ts`). Storing a stale printing id is
 * harmless anyway — a re-ingest can retire one, and a row nothing renders is inert.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { getDb } from './index.js';
import { collectionItems } from './schema.js';

type Db = ReturnType<typeof getDb>;

/** The whole Collection as `printingId → quantity`. At most one row per Printing, ~700 max. */
export async function getCollection(db: Db, userId: string): Promise<Record<string, number>> {
	const rows = await db
		.select({ printingId: collectionItems.printingId, quantity: collectionItems.quantity })
		.from(collectionItems)
		.where(eq(collectionItems.userId, userId));

	return Object.fromEntries(rows.map((row) => [row.printingId, row.quantity]));
}

export async function getQuantity(db: Db, userId: string, printingId: string): Promise<number> {
	const [row] = await db
		.select({ quantity: collectionItems.quantity })
		.from(collectionItems)
		.where(
			and(eq(collectionItems.userId, userId), eq(collectionItems.printingId, printingId))
		);
	return row?.quantity ?? 0;
}

/**
 * Sets a Printing's quantity outright, and **deletes at zero or below** — owning none of a
 * Printing is the absence of a row, not a row holding `0`, so the table only ever states facts.
 *
 * Absolute rather than a delta on purpose. The client is optimistic (a checklist session is
 * dozens of taps, and a round trip per tap is unusable), and deltas make that unsafe: a retried or
 * duplicated `+1` silently double-counts, where a repeated "set to 3" is idempotent. The client
 * already knows the number it wants to see.
 */
export async function setQuantity(
	db: Db,
	userId: string,
	printingId: string,
	quantity: number
): Promise<number> {
	if (quantity <= 0) {
		await db
			.delete(collectionItems)
			.where(
				and(eq(collectionItems.userId, userId), eq(collectionItems.printingId, printingId))
			);
		return 0;
	}

	await db
		.insert(collectionItems)
		.values({ userId, printingId, quantity })
		.onConflictDoUpdate({
			target: [collectionItems.userId, collectionItems.printingId],
			set: { quantity, updatedAt: new Date() }
		});

	return quantity;
}

/**
 * **D1 allows at most 100 bound parameters per statement.**
 * (https://developers.cloudflare.com/d1/platform/limits/)
 *
 * That is the binding constraint on every bulk write here, and it is easy to sail past without
 * noticing: "add all missing" on the base set is 150 printings, and an upsert binds three values
 * per row, so a single statement would carry ~450 parameters and D1 rejects the whole thing.
 * Chunk sizes below are derived from that ceiling rather than picked by feel.
 */
const D1_MAX_BOUND_PARAMS = 100;

/** 3 bound values per row (user, printing, quantity), plus 1 for `updatedAt` in the set clause. */
const UPSERT_CHUNK = Math.floor((D1_MAX_BOUND_PARAMS - 1) / 3);

/** 1 bound value for the user, then one per printing id in the `IN (...)`. */
const DELETE_CHUNK = D1_MAX_BOUND_PARAMS - 1;

function chunk<T>(items: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

/**
 * Sets many Printings at once — the "add every Printing in this Set at 1×" bulk action.
 *
 * Zero-or-below entries delete, exactly as `setQuantity` does, so a bulk "clear this set" is the
 * same call shape as a bulk add.
 *
 * Statements are chunked to respect D1's parameter ceiling and then sent as **one `batch`**, which
 * D1 runs in an implicit transaction. That matters here: a half-applied "add all missing" would
 * leave the user looking at a checklist that disagrees with what the next page load shows, and
 * there is no sensible way for the client to know which half landed.
 */
export async function setQuantities(
	db: Db,
	userId: string,
	quantities: ReadonlyMap<string, number>
): Promise<void> {
	const statements = buildSetQuantitiesStatements(db, userId, quantities);
	if (statements.length === 0) return;
	// `batch` needs a non-empty tuple; the guard above is what makes this cast honest.
	await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
}

/**
 * Split out so a test can assert the parameter arithmetic without a database — see
 * `collection.spec.ts`. The bug this guards against (a statement over D1's 100-parameter ceiling)
 * is invisible in types and only shows up as a rejected write at runtime.
 */
export function buildSetQuantitiesStatements(
	db: Db,
	userId: string,
	quantities: ReadonlyMap<string, number>
) {
	const removals = [...quantities].filter(([, quantity]) => quantity <= 0).map(([id]) => id);
	const upserts = [...quantities]
		.filter(([, quantity]) => quantity > 0)
		.map(([printingId, quantity]) => ({ userId, printingId, quantity }));

	return [
		...chunk(removals, DELETE_CHUNK).map((ids) =>
			db
				.delete(collectionItems)
				.where(and(eq(collectionItems.userId, userId), inArray(collectionItems.printingId, ids)))
		),
		...chunk(upserts, UPSERT_CHUNK).map((rows) =>
			db
				.insert(collectionItems)
				.values(rows)
				.onConflictDoUpdate({
					target: [collectionItems.userId, collectionItems.printingId],
					// `excluded` is the row that failed to insert — SQLite's name for the incoming
					// values, which is how one statement carries a different quantity per Printing.
					set: { quantity: sql`excluded.quantity`, updatedAt: new Date() }
				})
		)
	];
}

/** Distinct Printings held, and total copies. Two numbers the Collection header always wants. */
export async function getCollectionTotals(
	db: Db,
	userId: string
): Promise<{ printings: number; copies: number }> {
	const [row] = await db
		.select({
			printings: sql<number>`count(*)`,
			copies: sql<number>`coalesce(sum(${collectionItems.quantity}), 0)`
		})
		.from(collectionItems)
		.where(eq(collectionItems.userId, userId));

	return { printings: row?.printings ?? 0, copies: row?.copies ?? 0 };
}
