/**
 * Guards the whole `/collection` subtree in one place, and carries `user` so Nav shows accurate
 * sign-in state here — the same shape `/decks` uses.
 */
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Overrides the root layout's `prerender = true` for this subtree — request-scoped session state.
export const prerender = false;

/**
 * Deliberately **no `cache-control`**, unlike `/sets/[id]` and `/cards/[slug]`. Those are public
 * pages that happen to be dynamic, so they earn an `s-maxage` edge cache; everything under here is
 * about one person and must never be shared. Its absence is the point, so it's stated rather than
 * left to be inferred.
 */
export const load: LayoutServerLoad = (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');
	return { user: event.locals.user };
};
