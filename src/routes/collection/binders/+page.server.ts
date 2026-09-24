/**
 * The owner's list of Binders. Auth comes from `../+layout.server.ts`, which guards the whole
 * `/collection` subtree — so unlike `/collection/binders/[id]`, which is deliberately exempt from
 * that guard, nothing here has to cope with a stranger.
 *
 * Mutations are form actions rather than an API endpoint: they are deliberate, one-at-a-time acts
 * that want to work without JavaScript, which is the same reasoning `/decks` uses for renaming and
 * deleting. Pocket edits are the exception and live on the Binder's own page.
 *
 * No `load`: the rail lists Binders on every pane, so `../+layout.server.ts` fetches them and this
 * page inherits `data.binders` — one query per navigation instead of two identical ones.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	createBinder,
	deleteBinder,
	getBinder,
	renameBinder,
	setBinderVisibility
} from '#lib/server/db/binders.js';
import type { Actions } from './$types';

const VisibilitySchema = v.picklist(['private', 'shared']);

/** Mirrors `requireOwnedDeck`: every row action names a Binder by id from form data, verified
 * owned here so a crafted request can't rename, reshare or delete someone else's. */
async function requireOwnedBinder(event: {
	locals: App.Locals;
	request: Request;
}): Promise<{ binderId: string; formData: FormData }> {
	if (!event.locals.user) return redirect(302, '/auth/login');

	const formData = await event.request.formData();
	const binderId = formData.get('binderId');
	if (typeof binderId !== 'string') return error(400, 'Missing binderId');

	const binder = await getBinder(event.locals.db, binderId);
	if (!binder) return error(404, 'Binder not found');
	if (binder.ownerId !== event.locals.user.id) return error(403, 'Not your binder');

	return { binderId, formData };
}

export const actions: Actions = {
	create: async (event) => {
		if (!event.locals.user) return redirect(302, '/auth/login');

		const formData = await event.request.formData();
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Binder name cannot be empty' });
		}

		const binder = await createBinder(event.locals.db, event.locals.user.id, name.trim());
		// Straight into the new Binder: you made it to put cards in it.
		return redirect(303, `/collection/binders/${binder.id}`);
	},

	rename: async (event) => {
		const { binderId, formData } = await requireOwnedBinder(event);
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Binder name cannot be empty' });
		}
		await renameBinder(event.locals.db, binderId, name.trim());
	},

	visibility: async (event) => {
		const { binderId, formData } = await requireOwnedBinder(event);
		let visibility;
		try {
			visibility = v.parse(VisibilitySchema, formData.get('visibility'));
		} catch {
			return fail(400, { message: 'Invalid visibility' });
		}
		await setBinderVisibility(event.locals.db, binderId, visibility);
	},

	delete: async (event) => {
		const { binderId } = await requireOwnedBinder(event);
		await deleteBinder(event.locals.db, binderId);
	}
};
