/**
 * What kind of event a Tournament is, decided from its **name**.
 *
 * Melee has no such field (research `melee-ingest.md`): "Showdown" lives only in the name an organizer
 * typed. So the kind is derived from it, by rules, and rules change. It is **stored** on
 * `tournaments.kind` (ingest writes it) because the list filters and counts by it in SQL; when a rule
 * is added, `pnpm melee --reparse` recomputes every event's kind from its name, with no re-fetch.
 *
 * The categories are the program's own, named by the project owner: Regional, Showdown, Brawl,
 * Prerelease, and `Other` for anything no rule matches (a guess would be worse than "Other").
 *
 * **Only Showdown has been seen in real data** (all five ingested events). The other patterns are
 * the obvious spellings, not observed names: check them against the first real Regional, Brawl or
 * Prerelease before trusting them, and add whatever an organizer actually types.
 */
export const EVENT_KINDS = ['Regional', 'Showdown', 'Brawl', 'Prerelease', 'Other'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * In priority order; the first match wins. Most specific first: a name that says both ("Regional
 * Showdown Qualifier") is the bigger event, so Regional is tried before Showdown. Whole words only, so
 * "Brawlers Club" isn't a Brawl.
 */
const RULES: readonly { kind: Exclude<EventKind, 'Other'>; pattern: RegExp }[] = [
	{ kind: 'Regional', pattern: /\bregionals?\b/i },
	{ kind: 'Prerelease', pattern: /\bpre[- ]?releases?\b/i },
	{ kind: 'Brawl', pattern: /\bbrawls?\b/i },
	{ kind: 'Showdown', pattern: /\bshowdowns?\b/i }
];

export function eventKind(name: string): EventKind {
	return RULES.find((rule) => rule.pattern.test(name))?.kind ?? 'Other';
}

/**
 * `?kind=Regional,Showdown` → those kinds, once each, in the usual order (most to least significant),
 * so the same choice is always the same URL. Anything unrecognised is dropped; none left means "any".
 */
export function parseKinds(text: string | null | readonly string[]): EventKind[] {
	const asked = new Set(
		(typeof text === 'string' ? [text] : (text ?? [])).flatMap((t) => t.split(','))
	);
	return EVENT_KINDS.filter((kind) => asked.has(kind));
}

/** What `?kind=` must say for these kinds; null for "any", which is a link that says nothing. */
export const formatKinds = (kinds: readonly EventKind[]): string | null =>
	kinds.length === 0 ? null : EVENT_KINDS.filter((kind) => kinds.includes(kind)).join(',');

/** The choice with one kind switched: the link behind each checkbox of a multiselect. */
export const toggleKind = (kinds: readonly EventKind[], kind: EventKind): EventKind[] =>
	EVENT_KINDS.filter((k) => (k === kind ? !kinds.includes(k) : kinds.includes(k)));

/**
 * The kinds from `kind` on up in significance ("Showdown and bigger"): `EVENT_KINDS` runs from the
 * biggest events to the smallest, so these are the ones at or before it.
 */
export const kindsAtLeast = (kind: EventKind): EventKind[] =>
	EVENT_KINDS.slice(0, EVENT_KINDS.indexOf(kind) + 1);

/** What a closed selector says: "All kinds", the one chosen, a short list, or how many. */
export function kindsSummary(kinds: readonly EventKind[]): string {
	if (kinds.length === 0) return 'All kinds';
	return kinds.length <= 2 ? kinds.join(', ') : `${kinds.length} kinds`;
}
