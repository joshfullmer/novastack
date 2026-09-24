/**
 * The Collection's own page — the feature's home, and the winning shape from the prototype
 * (`src/routes/collection-prototype/NOTES.md`, Variant B).
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this reads request-scoped session state.
export const prerender = false;

/**
 * Deliberately **no `cache-control`**, unlike `/sets/[id]` and `/cards/[slug]`. Those are public
 * pages that happen to be dynamic, so they earn an `s-maxage` edge cache; this one is about one
 * person and must never be shared. Its absence is the point, so it's stated rather than assumed.
 *
 * Ownership still arrives client-side from `/api/collection` rather than being loaded here, so
 * that the store stays the single source of truth across every surface — a server-rendered count
 * here would disagree with the steppers the moment one was clicked.
 */
export const load: PageServerLoad = (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');
	return { user: event.locals.user };
};
