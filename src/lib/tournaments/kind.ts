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
