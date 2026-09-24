/**
 * The owner's list of Wantlists. Auth comes from `../+layout.server.ts`, which guards the whole
 * `/collection` subtree — so unlike `/collection/wantlists/[id]`, which is deliberately exempt
 * from that guard, nothing here has to cope with a stranger.
 *
 * No `load`: the rail lists Wantlists on every pane, so the layout fetches them and this page
 * inherits `data.wantlists` — one query per navigation instead of two identical ones. Same
 * arrangement as `/collection/binders`.
 *
 * Mutations are form actions rather than an API endpoint: they are deliberate, one-at-a-time acts
 * that want to work without JavaScript, which is the same reasoning `/decks` uses for renaming and
 * deleting. Entry edits are the exception and live on the Wantlist's own page.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	createWantlist,
	deleteWantlist,
	getWantlist,
	renameWantlist,
	setDefaultWantlist,
	setWantlistVisibility
} from '#lib/server/db/wantlists.js';
import type { Actions } from './$types';

const VisibilitySchema = v.picklist(['private', 'shared']);

/** Mirrors `requireOwnedBinder`: every row action names a Wantlist by id from form data, verified
 * owned here so a crafted request can't rename, reshare or delete someone else's. */
async function requireOwnedWantlist(event: {
	locals: App.Locals;
	request: Request;
}): Promise<{ wantlistId: string; formData: FormData }> {
	if (!event.locals.user) return redirect(302, '/auth/login');

	const formData = await event.request.formData();
	const wantlistId = formData.get('wantlistId');
	if (typeof wantlistId !== 'string') return error(400, 'Missing wantlistId');

	const wantlist = await getWantlist(event.locals.db, wantlistId);
	if (!wantlist) return error(404, 'Wantlist not found');
	if (wantlist.ownerId !== event.locals.user.id) return error(403, 'Not your wantlist');

	return { wantlistId, formData };
}

export const actions: Actions = {
	create: async (event) => {
		if (!event.locals.user) return redirect(302, '/auth/login');

		const formData = await event.request.formData();
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Wantlist name cannot be empty' });
		}

		const wantlist = await createWantlist(event.locals.db, event.locals.user.id, name.trim());
		// Straight into the new Wantlist: you made it to put cards on it.
		return redirect(303, `/collection/wantlists/${wantlist.id}`);
	},

	rename: async (event) => {
		const { wantlistId, formData } = await requireOwnedWantlist(event);
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Wantlist name cannot be empty' });
		}
		await renameWantlist(event.locals.db, wantlistId, name.trim());
	},

	visibility: async (event) => {
		const { wantlistId, formData } = await requireOwnedWantlist(event);
		const parsed = v.safeParse(VisibilitySchema, formData.get('visibility'));
		if (!parsed.success) return fail(400, { message: 'Invalid visibility' });
		await setWantlistVisibility(event.locals.db, wantlistId, parsed.output);
	},

	/**
	 * Designates the list that `/collection`'s "want this" adds to.
	 *
	 * Named `makeDefault`, not `default`: SvelteKit reserves that for a form's unnamed action, and
	 * `?/default` 500s.
	 */
	makeDefault: async (event) => {
		const { wantlistId } = await requireOwnedWantlist(event);
		if (!event.locals.user) return redirect(302, '/auth/login');
		await setDefaultWantlist(event.locals.db, event.locals.user.id, wantlistId);
	},

	delete: async (event) => {
		const { wantlistId } = await requireOwnedWantlist(event);
		await deleteWantlist(event.locals.db, wantlistId);
	}
};
