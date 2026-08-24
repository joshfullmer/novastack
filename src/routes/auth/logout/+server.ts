import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// `+server.ts` doesn't inherit a parent layout's page options, so this needs its own override.
export const prerender = false;

/**
 * A plain `+server.ts` action rather than a page's form action: sign-out is reachable from Nav,
 * which sits outside any single page's `+page.server.ts` actions.
 */
export const POST: RequestHandler = async (event) => {
	await event.locals.auth.api.signOut({ headers: event.request.headers });
	return redirect(303, '/');
};
