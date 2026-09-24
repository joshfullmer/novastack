/**
 * Guards the whole `/collection` subtree in one place, and carries `user` so Nav shows accurate
 * sign-in state here — the same shape `/decks` uses.
 */
import { redirect } from '@sveltejs/kit';
import { listBinders } from '#lib/server/db/binders.js';
import type { LayoutServerLoad } from './$types';

// Overrides the root layout's `prerender = true` for this subtree — request-scoped session state.
export const prerender = false;

/**
 * The one pane in here a stranger may reach, matched by **route id** rather than by picking apart
 * the pathname: `event.route.id` is the route itself, so this can't be fooled by a path that
 * merely looks like one, and it fails loudly if the route is ever moved again.
 *
 * A Binder is shareable by link (`docs/adr/0003-the-collection-is-flat-and-binders-are-showcases.md`),
 * and a link only its author can open is not a share. This does not decide *whether* a given
 * Binder is visible — the page still 404s a private one for a non-owner. It only lets the request
 * get that far.
 */
const PUBLIC_ROUTES = new Set(['/collection/binders/[id]']);

/**
 * Deliberately **no `cache-control`**, unlike `/sets/[id]` and `/cards/[slug]`. Those are public
 * pages that happen to be dynamic, so they earn an `s-maxage` edge cache; everything under here is
 * about one person and must never be shared. Its absence is the point, so it's stated rather than
 * left to be inferred.
 */
export const load: LayoutServerLoad = async (event) => {
	const { user } = event.locals;

	if (!user) {
		if (!PUBLIC_ROUTES.has(event.route.id ?? '')) return redirect(302, '/auth/login');
		// The rail is suppressed for a stranger — every figure in it describes a Collection they
		// haven't got — so there is nothing to load for them.
		return { user: null, binders: [] };
	}

	// Binders load here rather than per-pane because the rail lists them on every pane. Two small
	// queries, and `/collection/binders` reuses this rather than loading its own copy.
	return { user, binders: await listBinders(event.locals.db, user.id) };
};
