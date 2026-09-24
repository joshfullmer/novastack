/**
 * One Wantlist — its entries, and the URL you share.
 *
 * Owner always sees it; a non-owner only if `shared`. A private Wantlist **404s for a non-owner
 * rather than 403ing**, so a guessed id can't confirm that one exists — the same rule
 * `/collection/binders/[id]` and `/decks/folders/[id]` follow. `../+layout.server.ts` exempts this
 * route from the subtree's session guard, because a link only its author can open is not a share.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { dataset } from '#lib/cards/index.js';
import {
	getWantlist,
	getWantlistEntries,
	renameWantlist,
	setWanted,
	setWantlistVisibility
} from '#lib/server/db/wantlists.js';
import type { Actions, PageServerLoad } from './$types';

export const prerender = false;

/** Every Printing id in the dataset, so an unknown one is rejected at the boundary. */
const printingIds = new Set(
	dataset.cards.flatMap((card) => card.printings.map((printing) => printing.id))
);

/** Matches `wantlists.ts`'s cap, and rejects rather than silently clamping. */
const QuantitySchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999));

export const load: PageServerLoad = async (event) => {
	const wantlist = await getWantlist(event.locals.db, event.params.id);
	if (!wantlist) return error(404, 'Wantlist not found');

	const isOwner = event.locals.user?.id === wantlist.ownerId;
	if (wantlist.visibility === 'private' && !isOwner) return error(404, 'Wantlist not found');

	return {
		wantlist: {
			id: wantlist.id,
			name: wantlist.name,
			visibility: wantlist.visibility,
			ownerName: wantlist.ownerName
		},
		isOwner,
		entries: await getWantlistEntries(event.locals.db, wantlist.id)
	};
};

/** Every action here mutates the Wantlist, so all of them require the owner. */
async function requireOwner(event: {
	locals: App.Locals;
	params: { id: string };
	request: Request;
}): Promise<{ wantlistId: string; formData: FormData }> {
	if (!event.locals.user) return redirect(302, '/auth/login');

	const wantlist = await getWantlist(event.locals.db, event.params.id);
	if (!wantlist) return error(404, 'Wantlist not found');
	if (wantlist.ownerId !== event.locals.user.id) return error(403, 'Not your wantlist');

	return { wantlistId: wantlist.id, formData: await event.request.formData() };
}

export const actions: Actions = {
	/**
	 * Sets how many copies of a Printing are wanted. **Absolute**, not a delta — the stepper sends
	 * the number it wants to end up at, so a double submit is idempotent. Zero removes the entry,
	 * which is also how "Remove" is implemented: there is no second action for it.
	 */
	want: async (event) => {
		const { wantlistId, formData } = await requireOwner(event);

		const printingId = formData.get('printingId');
		if (typeof printingId !== 'string' || !printingIds.has(printingId)) {
			return fail(400, { message: 'Unknown printing' });
		}

		const quantity = v.safeParse(QuantitySchema, Number(formData.get('quantity')));
		if (!quantity.success) return fail(400, { message: 'Invalid quantity' });

		// `note` is only passed when the form carried the field, so the stepper can't wipe a note
		// somebody typed — `setWanted` leaves it alone when it's `undefined`.
		const rawNote = formData.get('note');
		const note = rawNote === null ? undefined : String(rawNote).trim().slice(0, 140) || null;

		await setWanted(event.locals.db, wantlistId, printingId, quantity.output, note);
	},

	rename: async (event) => {
		const { wantlistId, formData } = await requireOwner(event);
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Wantlist name cannot be empty' });
		}
		await renameWantlist(event.locals.db, wantlistId, name.trim());
	},

	visibility: async (event) => {
		const { wantlistId, formData } = await requireOwner(event);
		const parsed = v.safeParse(v.picklist(['private', 'shared']), formData.get('visibility'));
		if (!parsed.success) return fail(400, { message: 'Invalid visibility' });
		await setWantlistVisibility(event.locals.db, wantlistId, parsed.output);
	}
};
