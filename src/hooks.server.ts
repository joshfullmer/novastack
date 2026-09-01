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
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
