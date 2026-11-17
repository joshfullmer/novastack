import { dataset } from '#lib/cards/index.js';
import { getDeckDetail, getDeckList } from '#lib/server/db/tournament-decks.js';
import { ramRows } from '#lib/server/db/tournament-stats.js';
import { DECKS_PER_PAGE, type DeckFilters } from '#lib/tournaments/deck-views.js';
import { RAM_PER_LEGEND } from '#lib/tournaments/present.js';
import { parseRam } from '#lib/tournaments/ram.js';
import { readViewPref } from '#lib/server/view-pref.js';
import { resolveCards } from '#lib/tournaments/search.js';
import type { PageServerLoad } from './$types';

const SLUG = /^[a-z0-9-]{1,100}$/;
// Melee's decklist ids are GUIDs.
const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const clip = (text: string | null) => text?.trim().slice(0, 60) || null;

/** Every Legend in the dataset, for the filter, by name. */
const legendChoices = dataset.cards
	.filter((card) => card.cardType === 'Legend')
	.map((card) => ({ slug: card.slug, name: card.name }))
	.sort((a, b) => a.name.localeCompare(b.name));

export const load: PageServerLoad = async ({ locals, parent, url, cookies }) => {
	const { period } = await parent();
	const q = url.searchParams;

	const cardText = clip(q.get('card'));
	const cards = cardText ? resolveCards(cardText, dataset.cards) : [];
	const legend = q.get('legend');
	const filters: DeckFilters = {
		legend: legend !== null && SLUG.test(legend) ? legend : null,
		ram: parseRam(q.get('ram'), RAM_PER_LEGEND),
		cards,
		player: clip(q.get('player')),
		sort: q.get('sort') === 'recent' ? 'recent' : 'finish',
		page: Math.max(1, Math.floor(Number(q.get('page'))) || 1)
	};

	// A card name that matches no card means "no deck", not "no filter": showing every deck for a
	// search that found nothing would be a lie.
	const empty = cardText !== null && cards.length === 0;
	const result = empty
		? { total: 0, page: 1, pages: 1, rows: [] }
		: await getDeckList(locals.db, period, filters);

	// The deck open in the pane beside the list, if one is asked for and exists.
	const asked = q.get('deck');
	const deck = asked !== null && GUID.test(asked) ? await getDeckDetail(locals.db, asked) : null;

	return {
		...result,
		deck,
		deckView: readViewPref(cookies, 'deck-cards-view', ['list', 'gallery'], 'gallery'),
		rams: (await ramRows(locals.db, period))
			.flatMap((row) => (row.line ? [{ ram: row.line, decks: row.decks }] : []))
			.sort((a, b) => b.decks - a.decks || a.ram.localeCompare(b.ram))
			.slice(0, 40),
		perPage: DECKS_PER_PAGE,
		filters: { ...filters, card: cardText },
		legendChoices
	};
};
