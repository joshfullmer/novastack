/**
 * The viewer's Wantlists, and adding cards to one, for surfaces **outside** `/collection`.
 *
 * It exists because "add what I'm missing to a wantlist" belongs on the deck view, which is a
 * public route with no access to the collection subtree's `load`. Everything inside
 * `/collection/wantlists` uses form actions instead, and should keep doing so: they are one
 * deliberate act at a time and work without JavaScript, where this is a bulk write made from a
 * page that already has the deck in memory.
 *
 * `private, no-store` on every response, like `../+server.ts`: this is one person's data and must
 * never be cached by anything in between.
 */
import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import { dataset } from '#lib/cards/index.js';
import { addWanted, createWantlist, getWantlist, listWantlists } from '#lib/server/db/wantlists.js';
import type { RequestHandler } from './$types';

export const prerender = false;

const NO_STORE = { 'cache-control': 'private, no-store' };

/** Every Printing id in the dataset, so an unknown one is rejected at the boundary. */
const printingIds = new Set(
	dataset.cards.flatMap((card) => card.printings.map((printing) => printing.id))
);

const BodySchema = v.object({
	/** An existing Wantlist to add to… */
	wantlistId: v.optional(v.pipe(v.string(), v.nonEmpty())),
	/** …or a name to create one with. Exactly one of the two. */
	name: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(60))),
	items: v.pipe(
		v.array(
			v.object({
				printingId: v.pipe(v.string(), v.nonEmpty()),
				quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999))
			})
		),
		v.nonEmpty('items: nothing to add'),
		// A deck is at most 50 cards, so anything near this is not a deck's worth of anything.
		v.maxLength(200, 'items: too many entries')
	)
});

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Not signed in');

	return json(
		{ wantlists: await listWantlists(event.locals.db, event.locals.user.id) },
		{
			headers: NO_STORE
		}
	);
};

/**
 * Adds copies to a Wantlist, **additively** — the one place a delta is the right shape, because
 * two decks needing the same card should ask for both (`addWanted`).
 *
 * Sequential rather than batched. A deck contributes at most fifty statements, each one row, and
 * `addWanted` reads the existing quantity inside its own upsert — so there is no round trip to
 * save and nothing to gain from the extra machinery `collection.ts` needs for its hundreds.
 */
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Not signed in');
	const userId = event.locals.user.id;

	let body;
	try {
		body = v.parse(BodySchema, await event.request.json());
	} catch (cause) {
		return error(400, cause instanceof v.ValiError ? cause.message : 'Malformed request body');
	}

	if ((body.wantlistId === undefined) === (body.name === undefined)) {
		return error(400, 'Give either wantlistId or name');
	}

	// Rejected rather than dropped, same as the Goal endpoint: a client whose idea of the dataset
	// disagrees with ours should hear about it, not silently save a subset.
	const unknown = body.items.find((item) => !printingIds.has(item.printingId));
	if (unknown) return error(400, `Unknown printing: ${unknown.printingId}`);

	let wantlistId: string;

	if (body.name === undefined) {
		const existing = await getWantlist(event.locals.db, body.wantlistId ?? '');
		// A 404 for someone else's list too: whether a given id exists is not this caller's business.
		if (!existing || existing.ownerId !== userId) return error(404, 'Wantlist not found');
		wantlistId = existing.id;
	} else {
		const created = await createWantlist(event.locals.db, userId, body.name);
		wantlistId = created.id;
	}

	for (const item of body.items) {
		await addWanted(event.locals.db, wantlistId, item.printingId, item.quantity);
	}

	return json({ wantlistId, added: body.items.length }, { headers: NO_STORE });
};
