import { dataset } from '#lib/cards/index.js';
import { getDeckDetail, getDeckList } from '#lib/server/db/tournament-decks.js';
import { ramRows } from '#lib/server/db/tournament-stats.js';
import {
	DECK_GUID,
	DECKS_PER_PAGE,
	LEGEND_LINE,
	type DeckFilters
} from '#lib/tournaments/deck-views.js';
import { fetchPage } from '#lib/server/paging.js';
import { isLegend, isPossibleLine, RAM_PER_LEGEND } from '#lib/tournaments/present.js';
import { parseRam } from '#lib/tournaments/ram.js';
import { DECK_VIEWS } from '#lib/decks/view.js';
import { readViewPref } from '#lib/server/view-pref.js';
import { resolveCards } from '#lib/tournaments/search.js';
import type { PageServerLoad } from './$types';

const SLUG = /^[a-z0-9-]{1,100}$/;
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
	const line = q.get('line');
	const filters: DeckFilters = {
		legend: legend !== null && SLUG.test(legend) ? legend : null,
		ram: parseRam(q.get('ram'), RAM_PER_LEGEND),
		line: line !== null && LEGEND_LINE.test(line) ? line : null,
		cards,
		player: clip(q.get('player')),
		sort: q.get('sort') === 'recent' ? 'recent' : 'finish',
		page: Math.max(1, Math.floor(Number(q.get('page'))) || 1)
	};

	// A card name that matches no card means "no deck", not "no filter": showing every deck for a
	// search that found nothing would be a lie. The same goes for a Legend, or a line of Legends, that is
	// well formed but not one the dataset has: nobody can have played it, so there is nothing to ask the
	// database, and anyone making such names up costs it nothing.
	const empty =
		(cardText !== null && cards.length === 0) ||
		(filters.legend !== null && !isLegend(filters.legend)) ||
		(filters.line !== null && !isPossibleLine(filters.line));
	const result = empty
		? { total: 0, page: 1, pages: 1, rows: [] }
		: await fetchPage(filters.page, (page) =>
				locals.cached('getDeckList', [period, { ...filters, page }], () =>
					getDeckList(locals.db, period, { ...filters, page })
				)
			);

	// The deck open in the pane beside the list, if one is asked for and exists.
	const asked = q.get('deck');
	const deck =
		asked !== null && DECK_GUID.test(asked)
			? await locals.cached('getDeckDetail', asked, () => getDeckDetail(locals.db, asked))
			: null;

	return {
		...result,
		deck,
		// Fits the screen on a wide one: the list and the deck each scroll, the window does not.
		fullHeight: true,
		deckView: readViewPref(cookies, 'deck-cards-view', DECK_VIEWS, 'gallery'),
		rams: (await locals.cached('ramRows', period, () => ramRows(locals.db, period)))
			.flatMap((row) => (row.line ? [{ ram: row.line, decks: row.decks }] : []))
			.sort((a, b) => b.decks - a.decks || a.ram.localeCompare(b.ram))
			.slice(0, 40),
		perPage: DECKS_PER_PAGE,
		filters: { ...filters, card: cardText },
		legendChoices
	};
};
