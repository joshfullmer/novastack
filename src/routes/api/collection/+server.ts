/**
 * The Collection's read/write endpoint.
 *
 * **Why an endpoint rather than a `load` and a form action.** Ownership has to reach three
 * surfaces with three different rendering models: `/cards` is prerendered
 * (`routes/+layout.ts`), while `/sets/[id]` and `/cards/[slug]` are Worker-rendered but send
 * `cache-control: public, s-maxage=3600` — a **shared** edge cache. Rendering a user's quantities
 * into either of those responses would put one person's Collection into a cache and serve it to
 * everybody. So ownership arrives client-side from here, on every surface, with
 * `private, no-store`. That's uniform, and it keeps the edge cache on the pages that have one.
 *
 * `GET` returns the whole Collection — at most ~700 entries, a few KB — because every consumer
 * wants random access to all of it (a Set checklist, an `owned:` query, a completion figure), and
 * paging it would cost more round trips than it saves bytes.
 */
import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import { dataset } from '#lib/cards/index.js';
import { getCollection, setQuantities, setQuantity } from '#lib/server/db/collection.js';
import { getGoalRuns } from '#lib/server/db/collecting-goal.js';
import type { RequestHandler } from './$types';

// Overrides the root layout's `prerender = true` — per-request session and DB state.
export const prerender = false;

/** Every Printing id in the dataset, so an unknown id is rejected at the boundary. */
const printingIds = new Set(
	dataset.cards.flatMap((card) => card.printings.map((printing) => printing.id))
);

/**
 * A quantity ceiling, so a fat-fingered or hostile request can't store `1e9`. High enough that no
 * real collector hits it — 99 copies of one Printing is already a sealed-case quantity.
 */
const MAX_QUANTITY = 999;

const QuantitySchema = v.pipe(
	v.number('quantity: expected a number'),
	v.integer('quantity: expected an integer'),
	v.minValue(0, 'quantity: cannot be negative'),
	v.maxValue(MAX_QUANTITY, `quantity: cannot exceed ${MAX_QUANTITY}`)
);

/** One Printing, or many — the bulk form is what "add every Printing in this Set" posts. */
const BodySchema = v.union([
	v.object({
		printingId: v.pipe(v.string(), v.nonEmpty()),
		quantity: QuantitySchema
	}),
	v.object({
		items: v.pipe(
			v.array(
				v.object({
					printingId: v.pipe(v.string(), v.nonEmpty()),
					quantity: QuantitySchema
				})
			),
			v.nonEmpty('items: expected at least one entry'),
			// One Set's worth of printings is the largest legitimate bulk write (`MS01-WNC` has 472).
			v.maxLength(1000, 'items: too many entries in one request')
		)
	})
]);

/** `private, no-store` on every response here — see the module comment. */
const NO_STORE = { 'cache-control': 'private, no-store' };

/**
 * The Collecting Goal rides along here rather than having its own GET: it is part of the same
 * "my collection state" read, every consumer of one wants the other (a completion figure needs
 * both), and a second round trip on every page would buy nothing. Writes are separate — see
 * `goal/+server.ts` — because they are a different action with a different shape.
 *
 * `runs: null` means the user has never saved a Goal, which is **not** the same as saving an
 * empty one. The client resolves null to `DEFAULT_GOAL`; an empty array genuinely means "I am
 * collecting nothing", and the two must not collapse.
 */
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Not signed in');

	const [collection, runs] = await Promise.all([
		getCollection(event.locals.db, event.locals.user.id),
		getGoalRuns(event.locals.db, event.locals.user.id)
	]);

	return json({ collection, goal: { runs } }, { headers: NO_STORE });
};

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Not signed in');
	const userId = event.locals.user.id;

	let body;
	try {
		body = v.parse(BodySchema, await event.request.json());
	} catch (cause) {
		return error(400, cause instanceof v.ValiError ? cause.message : 'Malformed request body');
	}

	if ('printingId' in body) {
		if (!printingIds.has(body.printingId)) return error(400, 'Unknown printing');
		const quantity = await setQuantity(event.locals.db, userId, body.printingId, body.quantity);
		return json({ printingId: body.printingId, quantity }, { headers: NO_STORE });
	}

	// Last write wins on a duplicated id, which is what a Map gives us for free.
	const quantities = new Map<string, number>();
	for (const item of body.items) {
		if (!printingIds.has(item.printingId)) return error(400, `Unknown printing: ${item.printingId}`);
		quantities.set(item.printingId, item.quantity);
	}

	await setQuantities(event.locals.db, userId, quantities);
	return json({ written: quantities.size }, { headers: NO_STORE });
};
