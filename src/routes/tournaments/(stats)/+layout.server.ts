import { periodFor } from '#lib/server/tournament-period.js';
import type { LayoutServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — everything here reads D1.
export const prerender = false;

/**
 * Every statistics page is cut by a period (`?period=<meta id>`), so it is resolved once here. An id
 * that names no meta means all time, not an error: a stale link should still show something true.
 */
export const load: LayoutServerLoad = ({ locals, url }) => periodFor(locals.db, url);
