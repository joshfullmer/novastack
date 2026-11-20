import { periodFor } from '#lib/server/tournament-period.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { LayoutServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — everything here reads D1.
export const prerender = false;

/**
 * What the sidebar and the statistics pages are cut by, resolved once for the whole section. A period
 * (`?period=<meta id>`) that names no meta means all time, not an error: a stale link should still show
 * something true. The sidebar's open / collapsed choice is a cookie read here, so the first render already
 * has it.
 */
export const load: LayoutServerLoad = async ({ locals, url, cookies }) => ({
	...(await periodFor(locals.cached, locals.db, url)),
	navState: readViewPref(cookies, 'tournaments-nav', ['open', 'collapsed'], 'open')
});
