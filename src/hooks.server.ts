import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { createAuth } from '#lib/server/auth.js';
import { getDb } from '#lib/server/db/index.js';
import { svelteKitHandler } from 'better-auth/svelte-kit';

/**
 * Only the deckbuilder's own routes are dynamic — `/`, `/cards`, and `/cards/[slug]` are static
 * and prerendered (`docs/spec/deckbuilder.md` §1.4), and SvelteKit enforces that a prerenderable
 * route never touches `platform.env` at all, in any mode. Gating on the URL, not just skipping
 * silently on failure, keeps that boundary explicit rather than accidental.
 */
const DYNAMIC_PREFIXES = ['/decks', '/explore', '/auth', '/account', '/api/auth'];

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
