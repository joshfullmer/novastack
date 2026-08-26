/**
 * Reads a small UI-preference cookie (a List/Grid toggle, say) server-side, so the very first
 * render already matches what the visitor chose last time. No client-side correction after the
 * fact, and — unlike a `localStorage`-backed value — no need to render a hidden alternative
 * "just in case" either, since the server already knows which one to render.
 *
 * `allowed` guards against a stale or hand-edited cookie value — an unrecognized value falls
 * back to `initial` rather than propagating.
 */
import type { Cookies } from '@sveltejs/kit';

export function readViewPref<T extends string>(
	cookies: Cookies,
	key: string,
	allowed: readonly T[],
	fallback: T
): T {
	const value = cookies.get(key);
	return value !== undefined && (allowed as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}
