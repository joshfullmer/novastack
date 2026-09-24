/**
 * Collecting Goal data access — the only place route code touches `collecting_goals`, the same
 * convention `decks.ts`, `folders.ts` and `collection.ts` follow.
 *
 * **Absence means the default.** No row is the normal state for someone who has never opened the
 * editor, so `getGoalRuns` returns `null` rather than an empty array — those are different facts,
 * and conflating them would turn "I haven't chosen" into "I collect nothing", which is a 0%
 * completion figure for every new user. Resolving `null` to `DEFAULT_GOAL` is the caller's job,
 * because the default lives with the domain logic (`#lib/collection/goal.ts`) and not with the
 * table.
 */
import { eq } from 'drizzle-orm';
import type { getDb } from './index.js';
import { collectingGoals } from './schema.js';

type Db = ReturnType<typeof getDb>;

/** The stored Run keys, or `null` when the user has never saved a Goal. */
export async function getGoalRuns(db: Db, userId: string): Promise<string[] | null> {
	const [row] = await db
		.select({ runs: collectingGoals.runs })
		.from(collectingGoals)
		.where(eq(collectingGoals.userId, userId));

	// `mode: 'json'` types this as `string[]`, but the column is text and a hand-edited or
	// pre-migration value could be anything — so it is checked rather than trusted, the same way
	// `deck_versions.entries` is validated at its boundary.
	if (!row || !Array.isArray(row.runs)) return null;
	return row.runs.filter((run): run is string => typeof run === 'string');
}

/**
 * Replaces the whole Goal. Written whole because that is how it is read and how the editor
 * produces it — there is no partial update a caller could want, and a per-Run diff would invent
 * an ordering question the domain doesn't have.
 */
export async function setGoalRuns(db: Db, userId: string, runs: readonly string[]): Promise<void> {
	// Deduplicated and sorted so two equivalent Goals store identically — worth it purely so a
	// diff of two users' rows, or of one user's row over time, is readable.
	const normalized = [...new Set(runs)].sort();

	await db
		.insert(collectingGoals)
		.values({ userId, runs: normalized })
		.onConflictDoUpdate({
			target: collectingGoals.userId,
			set: { runs: normalized, updatedAt: new Date() }
		});
}

/** Drops a saved Goal, returning the user to the default. */
export async function clearGoal(db: Db, userId: string): Promise<void> {
	await db.delete(collectingGoals).where(eq(collectingGoals.userId, userId));
}
