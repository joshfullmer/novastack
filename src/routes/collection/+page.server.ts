/**
 * The Collection view's own load: the Wantlist that "want this" adds to, and what's already on it.
 *
 * Auth and the Binder/Wantlist lists come from `+layout.server.ts`. This is here rather than there
 * because only this pane needs the *entries* — the rail needs counts, and loading a list's contents
 * on every collection pane to serve one of them would be a query nobody asked for.
 *
 * `wanted` is a plain array of Printing ids: the grid only ever asks "is this one on the list",
 * and a set of ids is both the smallest thing that answers it and the only part of a Wantlist entry
 * this page has any business knowing.
 */
import { redirect } from '@sveltejs/kit';
import { defaultWantlist, getWantlistEntries } from '#lib/server/db/wantlists.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// The layout guarantees a user, but narrowing it here keeps this file readable on its own.
	if (!event.locals.user) return redirect(302, '/auth/login');

	const wantlist = await defaultWantlist(event.locals.db, event.locals.user.id);
	if (!wantlist) return { wantlist: null, wanted: [] };

	const entries = await getWantlistEntries(event.locals.db, wantlist.id);
	return { wantlist, wanted: entries.map((entry) => entry.printingId) };
};
