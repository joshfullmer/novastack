/**
 * How the tournament pages name things. Turns the slugs `EventView` carries into the Cards the
 * dataset knows, and a Legend's full name into the short one a row has room for.
 */
import { legendBaseName } from '../cards/derive.ts';
import { dataset } from '../cards/index.ts';
import type { Color } from '../cards/vocabulary.ts';
import type { GroupStat } from './meta.ts';

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

/**
 * "Who and where" on one line without saying the same thing twice. An organizer is often also the
 * venue ("Holodex" at "Holodex"), or the venue extends it ("Nexus Entertainment" at "Nexus
 * Entertainment - Tempe"); then only the more specific one is shown.
 */
export function wherePlayed(organizer: string, venue: string | null): string {
	if (!venue) return organizer;
	const [o, v] = [organizer.toLowerCase(), venue.toLowerCase()];
	if (v.includes(o)) return venue;
	if (o.includes(v)) return organizer;
	return `${organizer} · ${venue}`;
}

/** The Colours a set of Legends provides, in the fixed order Red, Yellow, Green, Blue. */
export function coloursOf(slugs: readonly string[]): Color[] {
	const have = new Set<Color>();
	for (const slug of slugs) {
		const colour = bySlug.get(slug)?.color;
		if (colour) have.add(colour);
	}
	return COLOUR_ORDER.filter((c) => have.has(c));
}

/**
 * Legend-line stats rolled up by the colours their Legends provide. The key is the colours joined by
 * `+` (`Red+Blue`); a line whose Legends are all unknown to the dataset lands under `—`.
 */
export function groupByColours(lines: readonly GroupStat[]): GroupStat[] {
	const groups = new Map<string, GroupStat & { won: number }>();
	for (const line of lines) {
		const key = coloursOf(line.legends).join('+') || '—';
		const group = groups.get(key) ?? {
			key,
			legends: [],
			decks: 0,
			share: 0,
			winRate: null,
			matches: 0,
			top8: 0,
			wins: 0,
			won: 0
		};
		group.decks += line.decks;
		group.share += line.share;
		group.matches += line.matches;
		group.top8 += line.top8;
		group.wins += line.wins;
		group.won += (line.winRate ?? 0) * line.matches;
		groups.set(key, group);
	}
	return [...groups.values()]
		.map(({ won, ...group }) => ({ ...group, winRate: group.matches ? won / group.matches : null }))
		.sort((a, b) => b.decks - a.decks || a.key.localeCompare(b.key));
}
