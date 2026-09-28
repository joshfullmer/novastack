/**
 * **Entitlements** — the paid features a user has been granted, and the one question every
 * surface asks about one: may this user use it?
 *
 * Feature keys rather than a plan name, deliberately. A plan is a billing artifact and changes
 * shape whenever pricing does ("Pro", then "Pro annual", then a comp for a playtester); a feature
 * key is a fact about a capability and never has to be renamed because the packaging moved. When
 * billing arrives, a plan becomes a *mapping* to these keys in one place, and no call site changes.
 *
 * Shared rather than server-only: a `load` sends the granted list down so the editor can decide
 * what to render, so both sides need the same vocabulary. The **decision** is still made on the
 * server for anything that writes — see the deck editor's `save` action, which re-derives the
 * grant instead of trusting what the client posts.
 */

/**
 * Every gated capability, by key.
 *
 * - `choose-printing` — picking which Printing of a Card a Deck names, rather than taking the
 *   Card's Default Printing. Ungated decks still *render* whatever printings they hold; what's
 *   gated is choosing.
 */
export const FEATURES = ['choose-printing'] as const;

export type Feature = (typeof FEATURES)[number];

const KNOWN: ReadonlySet<string> = new Set(FEATURES);

/**
 * The known features in a stored grant, dropping anything unrecognized.
 *
 * Lenient on purpose, and this is the interesting decision here. A stored key can outlive the
 * feature it named — a capability gets renamed, or folded into another, or dropped — and the right
 * response to "this user is entitled to something that no longer exists" is to ignore it, not to
 * throw. Strict parsing would turn a rename into a 500 on every request for whoever was grandfathered
 * in, which is both the worst possible audience for it and the hardest case to notice in testing.
 *
 * The inverse is not lenient: a key we don't know is never treated as a grant, so a typo in a
 * hand-written row unlocks nothing.
 */
export function parseFeatures(raw: unknown): Feature[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((value): value is Feature => typeof value === 'string' && KNOWN.has(value));
}

/**
 * Whether a grant covers a feature. Takes the list rather than reading a store, so it works
 * unchanged on the server (where it comes from D1) and in a component (where it came down as page
 * data), and so it can be unit-tested without either.
 *
 * `null`/`undefined` is the free tier, not an error: no row means no grants, and every surface
 * that has no user at all is in exactly the same position as one who hasn't paid.
 */
export function can(granted: readonly Feature[] | null | undefined, feature: Feature): boolean {
	return granted?.includes(feature) ?? false;
}
