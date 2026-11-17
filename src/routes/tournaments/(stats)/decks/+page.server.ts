import { dataset } from '#lib/cards/index.js';
import { getDeckList } from '#lib/server/db/tournament-decks.js';
import { DECKS_PER_PAGE, type DeckFilters } from '#lib/tournaments/deck-views.js';
import { resolveCards } from '#lib/tournaments/search.js';
import type { PageServerLoad } from './$types';

const SLUG = /^[a-z0-9-]{1,100}$/;
const clip = (text: string | null) => text?.trim().slice(0, 60) || null;

/** Every Legend in the dataset, for the filter, by name. */
const legendChoices = dataset.cards
	.filter((card) => card.cardType === 'Legend')
	.map((card) => ({ slug: card.slug, name: card.name }))
	.sort((a, b) => a.name.localeCompare(b.name));

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	const q = url.searchParams;

	const cardText = clip(q.get('card'));
	const cards = cardText ? resolveCards(cardText, dataset.cards) : [];
	const legend = q.get('legend');
	const filters: DeckFilters = {
		legend: legend !== null && SLUG.test(legend) ? legend : null,
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

	return {
		...result,
		perPage: DECKS_PER_PAGE,
		filters: { ...filters, card: cardText },
		legendChoices
	};
};
