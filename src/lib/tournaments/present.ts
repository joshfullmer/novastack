/**
 * How the tournament pages name things. Turns the slugs `EventView` carries into the Cards the
 * dataset knows, and a Legend's full name into the short one a row has room for.
 */
import { legendBaseName } from '../cards/derive.ts';
import { dataset } from '../cards/index.ts';
import type { Color } from '../cards/vocabulary.ts';

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

const COLOUR_ORDER: readonly Color[] = ['Red', 'Yellow', 'Green', 'Blue'];

/**
 * An event's Legend picks as colour segments, as percent widths, for a field-composition bar. A Legend
 * the dataset doesn't know contributes nothing: a colour we can't state would be a guess.
 */
export function fieldByColour(counts: readonly { slug: string; decks: number }[]) {
	const by = new Map<Color, number>();
	for (const { slug, decks } of counts) {
		const colour = bySlug.get(slug)?.color;
		if (colour) by.set(colour, (by.get(colour) ?? 0) + decks);
	}
	const total = [...by.values()].reduce((a, b) => a + b, 0) || 1;
	return COLOUR_ORDER.filter((c) => by.has(c)).map((colour) => ({
		colour,
		width: ((by.get(colour) ?? 0) / total) * 100
	}));
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st: English ordinals, teens included. */
export function ordinal(n: number): string {
	const teen = n % 100 >= 11 && n % 100 <= 13;
	const suffix = teen
		? 'th'
		: (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
	return `${n}${suffix}`;
}
