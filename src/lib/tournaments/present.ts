/**
 * How the tournament pages name things. Turns the slugs `EventView` carries into the Cards the
 * dataset knows, and a Legend's full name into the short one a row has room for.
 */
import { legendBaseName } from '../cards/derive.ts';
import { dataset } from '../cards/index.ts';

const bySlug = new Map(dataset.cards.map((card) => [card.slug, card]));

export const cardOf = (slug: string) => bySlug.get(slug);

/** A Card's full name, or its slug for one the dataset doesn't have (a newer set than our data). */
export const cardName = (slug: string) => bySlug.get(slug)?.name ?? slug;

/** A Legend's name without its subtitle: `Adam Smasher`, not `Adam Smasher: Ender of Legends`. */
export function legendShort(slug: string): string {
	const card = bySlug.get(slug);
	return card ? legendBaseName(card) : slug;
}

export const legendNames = (slugs: readonly string[]) => slugs.map(legendShort).join(' · ');

/** `Nov 16, 2026`, in UTC: Melee's dates are UTC, and a viewer's timezone shouldn't move an event's day. */
export const formatDate = (ms: number) =>
	new Date(ms).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
