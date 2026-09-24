import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { createAuth } from '#lib/server/auth.js';
import { getDb } from '#lib/server/db/index.js';
import { syncSignedInHint } from '#lib/server/signed-in-hint.js';
import { svelteKitHandler } from 'better-auth/svelte-kit';

/**
 * Only the deckbuilder's own routes are dynamic — `/`, `/cards`, and `/cards/[slug]` are static
 * and prerendered (`docs/spec/deckbuilder.md` §1.4), and SvelteKit enforces that a prerenderable
 * route never touches `platform.env` at all, in any mode. Gating on the URL, not just skipping
 * silently on failure, keeps that boundary explicit rather than accidental.
 *
 * `/api` covers the whole namespace rather than listing endpoints one at a time: every `/api`
 * route is dynamic by nature, and the failure mode of forgetting one is silent and confusing
 * rather than loud. A route missing from this list still *resolves* — it just never gets
 * `locals.db` or `locals.user`, so it behaves exactly as though nobody is ever signed in. That
 * cost a debugging session on `/api/collection`, which 401'd for signed-in users because
 * `/api/auth` didn't match it.
 */
const DYNAMIC_PREFIXES = [
	'/binders',
	'/collection',
	'/decks',
	'/explore',
	'/auth',
	'/account',
	'/api'
];

/**
 * A Discord sign-up lands with no `username` (see
 * docs/wayfinder/discord-login/tickets/03-first-time-username-picker.md) — every other dynamic
 * route is gated on having one until the picker fills it in. `/api/auth` is exempt so
 * better-auth's own endpoints (session checks) keep working; `/auth/choose-username` itself
 * obviously has to be reachable to fix the problem it's redirecting for; `/auth/logout` is
 * exempt so a user who'd rather abandon than pick a username right now still can (caught live —
 * without this, `/auth/logout`'s own `+server.ts` never ran, since it lives under `/auth`).
 */
const NEEDS_USERNAME_EXEMPT_PREFIXES = ['/api/auth', '/auth/choose-username', '/auth/logout'];

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const isDynamicRoute = DYNAMIC_PREFIXES.some((prefix) => event.url.pathname.startsWith(prefix));
	if (!isDynamicRoute) return resolve(event);

	if (!event.platform?.env?.DB)
		throw new Error('D1 binding "DB" not found - are you running with wrangler?');

	// Set once here so route code never repeats the `event.platform?.env?.DB` guard itself.
	event.locals.db = getDb(event.platform.env.DB);
	event.locals.auth = createAuth(event.platform.env.DB);

	const { auth } = event.locals;
	const session = await auth.api.getSession({ headers: event.request.headers });

	// Let prerendered and edge-cached pages render the right Nav state without a request of their
	// own. A UI hint, never an auth signal — see `#lib/server/signed-in-hint.ts`. Set here so any
	// real action self-heals it, including a session simply expiring.
	syncSignedInHint(event.cookies, session !== null);

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;

		if (
			!session.user.username &&
			!NEEDS_USERNAME_EXEMPT_PREFIXES.some((prefix) => event.url.pathname.startsWith(prefix))
		) {
			return new Response(null, {
				status: 302,
				headers: { location: '/auth/choose-username' }
			});
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
