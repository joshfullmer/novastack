/**
 * Creates a deck from a local draft (`docs/spec/deckbuilder.md` §10.5) — the one request a
 * signed-out visitor's work turns into an account-backed deck with.
 *
 * Everything in the body is validated as if it came from anywhere, because it does: a draft is
 * whatever was in `localStorage`. Same boundary rules as the editor's own Save — Printings are
 * stripped unless the user may choose them (`carryForwardPrintings`), the Guide has its length cap —
 * plus Bookmarks filtered to cards that exist.
 */
import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import { dataset } from '#lib/cards/index.js';
import { carryForwardPrintings } from '#lib/decks/carry-printings.js';
import { GUIDE_MAX_LENGTH } from '#lib/decks/guide.js';
import { deckPath } from '#lib/decks/links.js';
import { DeckVersionPayloadSchema } from '#lib/decks/schema.js';
import { can } from '#lib/entitlements.js';
import {
	createDeck,
	saveDeckVersion,
	setDeckBookmarks,
	setDeckGuide
} from '#lib/server/db/decks.js';
import { featuresFor } from '#lib/server/db/entitlements.js';
import type { RequestHandler } from './$types';

export const prerender = false;

const BodySchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.maxLength(100)),
	payload: DeckVersionPayloadSchema,
	bookmarks: v.array(v.string()),
	guide: v.pipe(v.string(), v.maxLength(GUIDE_MAX_LENGTH))
});

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Sign in to save a deck');

	let body;
	try {
		body = v.parse(BodySchema, await event.request.json());
	} catch {
		return error(400, 'Malformed draft');
	}

	const entitled = can(await featuresFor(event.locals.db, event.locals.user.id), 'choose-printing');
	const payload = entitled ? body.payload : carryForwardPrintings(null, body.payload);

	const deck = await createDeck(
		event.locals.db,
		event.locals.user.id,
		body.name === '' ? 'New deck' : body.name
	);
	await saveDeckVersion(event.locals.db, deck.id, payload);
	await setDeckBookmarks(
		event.locals.db,
		deck.id,
		[...new Set(body.bookmarks)].filter((slug) => dataset.bySlug.has(slug))
	);
	if (body.guide.trim() !== '') await setDeckGuide(event.locals.db, deck.id, body.guide);

	return json({ href: deckPath(deck) }, { headers: { 'cache-control': 'private, no-store' } });
};
