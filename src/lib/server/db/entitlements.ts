/**
 * Reading and writing a user's paid **entitlements** — the `user_entitlements` row behind
 * `#lib/entitlements.ts`'s feature keys.
 *
 * **No row means the free tier**, so this never writes on a read and every existing user is correct
 * without a backfill. `featuresFor` returning `[]` for "no grants" and for "user we've never heard
 * of" is deliberate: both are the same question answered the same way, and a signed-out visitor is
 * in exactly the position of someone who hasn't paid.
 *
 * Nothing in the app writes a grant yet — there's no billing. Until there is, a grant is one
 * command, which is the same arrangement `decks.isStarterDeck` has:
 *
 * ```
 * pnpm exec wrangler d1 execute novastack-decks --remote --command \
 *   "insert into user_entitlements (user_id, features) values ('<user-id>', '[\"choose-printing\"]')
 *    on conflict(user_id) do update set features = excluded.features, updated_at = unixepoch('subsecond') * 1000"
 * ```
 *
 * A Stripe webhook eventually replaces that command with `setFeatures`, and nothing else has to
 * change — which is the whole reason the gate is keyed on features rather than on a plan name.
 */
import { eq } from 'drizzle-orm';
import { parseFeatures, type Feature } from '#lib/entitlements.js';
import type { getDb } from './index.js';
import { userEntitlements } from './schema.js';

type Db = ReturnType<typeof getDb>;

/**
 * The features this user has been granted. `[]` for the free tier, an unknown user, or a stored
 * key that no longer names a live feature — see `parseFeatures` for why that last one is lenient
 * rather than fatal.
 */
export async function featuresFor(db: Db, userId: string | undefined): Promise<Feature[]> {
	if (!userId) return [];

	const [row] = await db
		.select({ features: userEntitlements.features })
		.from(userEntitlements)
		.where(eq(userEntitlements.userId, userId))
		.limit(1);

	return parseFeatures(row?.features);
}

/**
 * Replaces a user's grants outright.
 *
 * Absolute rather than additive, and an empty list **deletes the row** rather than storing `[]`:
 * the table then only ever holds grants, so "has this user ever paid" isn't a question the schema
 * invites anyone to ask of it. Same rule `collection_items` follows for a zero quantity.
 */
export async function setFeatures(
	db: Db,
	userId: string,
	features: readonly Feature[]
): Promise<void> {
	if (features.length === 0) {
		await db.delete(userEntitlements).where(eq(userEntitlements.userId, userId));
		return;
	}

	await db
		.insert(userEntitlements)
		.values({ userId, features: [...features] })
		.onConflictDoUpdate({
			target: userEntitlements.userId,
			set: { features: [...features], updatedAt: new Date() }
		});
}
