/**
 * Turning what a person typed into the Cards it means.
 *
 * A deck filter takes a card *name* ("satori"), but decks are indexed by slug. The match is the
 * site's own: accent-, case- and punctuation-insensitive (`normalizeForSearch`), so "mantis blades" and
 * "Mantis  Blades" find the same Card. It is a substring match, and capped, because a filter has to be
 * a bounded query: D1 allows 100 bound parameters, and the SQL is `IN (…)`.
 */
import { normalizeForSearch } from '../cards/dataset.ts';
import type { Card } from '../cards/schema.ts';

export const MAX_CARD_MATCHES = 40;
const MIN_QUERY = 2;

export function resolveCards(text: string, cards: readonly Card[]): string[] {
	const query = normalizeForSearch(text).trim();
	if (query.length < MIN_QUERY) return [];
	return cards
		.filter((card) => normalizeForSearch(card.name).includes(query))
		.slice(0, MAX_CARD_MATCHES)
		.map((card) => card.slug);
}
