/**
 * One Binder — the spread of Pages and Pockets, and the URL you share.
 *
 * Deliberately **not** under `/collection`: that subtree's layout redirects anyone without a
 * session, which would make a shared link useless to the person you shared it with. Same
 * arrangement as `/decks/folders/[id]`.
 *
 * Owner always sees it; a non-owner only if `shared`. A private Binder **404s for a non-owner
 * rather than 403ing**, so a guessed id can't confirm that one exists — copied from the shared
 * folder route, where the same reasoning applies.
 *
 * A non-owner sees exactly what the owner arranged, including empty Pockets: a held space is part
 * of the showcase, not an implementation detail to tidy away.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { dataset } from '#lib/cards/index.js';
import { POCKETS_PER_PAGE } from '#lib/collection/binders.js';
import {
	clearPocket,
	getBinder,
	getBinderPages,
	movePocket,
	removePage,
	renameBinder,
	setBinderVisibility,
	setPocket
} from '#lib/server/db/binders.js';
import type { Actions, PageServerLoad } from './$types';

export const prerender = false;

/** Every Printing id in the dataset, so an unknown one is rejected at the boundary. */
const printingIds = new Set(
	dataset.cards.flatMap((card) => card.printings.map((printing) => printing.id))
);

const PocketSchema = v.object({
	page: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(500)),
	pocket: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(POCKETS_PER_PAGE - 1))
});

export const load: PageServerLoad = async (event) => {
	const binder = await getBinder(event.locals.db, event.params.id);
	if (!binder) return error(404, 'Binder not found');

	const isOwner = event.locals.user?.id === binder.ownerId;
	if (binder.visibility === 'private' && !isOwner) return error(404, 'Binder not found');

	return {
		binder: {
			id: binder.id,
			name: binder.name,
			visibility: binder.visibility,
			ownerName: binder.ownerName
		},
		isOwner,
		pages: await getBinderPages(event.locals.db, binder.id)
	};
};

/** Every action here mutates the Binder, so all of them require the owner. */
async function requireOwner(event: {
	locals: App.Locals;
	params: { id: string };
	request: Request;
}): Promise<{ binderId: string; formData: FormData }> {
	if (!event.locals.user) return redirect(302, '/auth/login');

	const binder = await getBinder(event.locals.db, event.params.id);
	if (!binder) return error(404, 'Binder not found');
	if (binder.ownerId !== event.locals.user.id) return error(403, 'Not your binder');

	return { binderId: binder.id, formData: await event.request.formData() };
}

function readPocket(formData: FormData) {
	return v.safeParse(PocketSchema, {
		page: Number(formData.get('page')),
		pocket: Number(formData.get('pocket'))
	});
}

export const actions: Actions = {
	place: async (event) => {
		const { binderId, formData } = await requireOwner(event);

		const position = readPocket(formData);
		if (!position.success) return fail(400, { message: 'Invalid pocket' });

		const printingId = formData.get('printingId');
		if (typeof printingId !== 'string' || !printingIds.has(printingId)) {
			return fail(400, { message: 'Unknown printing' });
		}

		await setPocket(event.locals.db, binderId, position.output.page, position.output.pocket, printingId);
	},

	clear: async (event) => {
		const { binderId, formData } = await requireOwner(event);

		const position = readPocket(formData);
		if (!position.success) return fail(400, { message: 'Invalid pocket' });

		await clearPocket(event.locals.db, binderId, position.output.page, position.output.pocket);
	},

	move: async (event) => {
		const { binderId, formData } = await requireOwner(event);

		const from = readPocket(formData);
		const to = v.safeParse(PocketSchema, {
			page: Number(formData.get('toPage')),
			pocket: Number(formData.get('toPocket'))
		});
		if (!from.success || !to.success) return fail(400, { message: 'Invalid pocket' });

		await movePocket(event.locals.db, binderId, from.output, to.output);
	},

	/**
	 * Adding a Page needs no write: pages are derived from the highest occupied Pocket, so an
	 * empty trailing Page and "not added yet" are the same state. The client shows one more than
	 * it was given; the Page becomes real the moment something lands in it.
	 */
	removePage: async (event) => {
		const { binderId, formData } = await requireOwner(event);

		const page = Number(formData.get('page'));
		if (!Number.isInteger(page) || page < 0) return fail(400, { message: 'Invalid page' });

		await removePage(event.locals.db, binderId, page);
	},

	rename: async (event) => {
		const { binderId, formData } = await requireOwner(event);
		const name = formData.get('name');
		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { message: 'Binder name cannot be empty' });
		}
		await renameBinder(event.locals.db, binderId, name.trim());
	},

	visibility: async (event) => {
		const { binderId, formData } = await requireOwner(event);
		const parsed = v.safeParse(v.picklist(['private', 'shared']), formData.get('visibility'));
		if (!parsed.success) return fail(400, { message: 'Invalid visibility' });
		await setBinderVisibility(event.locals.db, binderId, parsed.output);
	}
};
