/**
 * `origin` (the app's own absolute base URL) inherited by every page's `data`, prerendered or
 * not — Open Graph tags need absolute URLs, and this is the one source of truth for that base
 * already established for auth (`#lib/server/auth.ts`'s `baseURL`), rather than trusting a
 * per-request `event.url.origin` that a prerendered page doesn't have anyway.
 */
import { ORIGIN } from '$app/env/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	return { origin: ORIGIN };
};
