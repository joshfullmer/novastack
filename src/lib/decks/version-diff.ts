/**
 * Diffs two consecutive `deck_versions` rows for the deck view page's Change History section.
 *
 * Compares `entries` by `cardSlug` + `quantity` only — `printingId` is ignored, since printing
 * choice is cosmetic everywhere else in the app (RAM/legality never depend on it). Legend swaps
 * do count: they materially change what the deck can run.
 *
 * The sideboard is diffed as its own section rather than folded into `entries`. Moving a card
 * between the two piles is the single most common edit a tuned list gets, and a merged diff would
 * render it as nothing at all — the combined quantity doesn't change.
 */
import type { DeckEntryPayload } from './schema.js';

export type EntryDiff =
	| { kind: 'added'; cardSlug: string; quantity: number }
	| { kind: 'removed'; cardSlug: string; quantity: number }
	| { kind: 'changed'; cardSlug: string; from: number; to: number };

export type VersionDiff = {
	entries: EntryDiff[];
	sideboard: EntryDiff[];
	legendsAdded: string[];
	legendsRemoved: string[];
};

type Version = { entries: DeckEntryPayload[]; legends: string[]; sideboard: DeckEntryPayload[] };

function diffEntries(
	before: readonly DeckEntryPayload[],
	after: readonly DeckEntryPayload[]
): EntryDiff[] {
	const prevQty = new Map(before.map((e) => [e.cardSlug, e.quantity]));
	const currQty = new Map(after.map((e) => [e.cardSlug, e.quantity]));

	const diffs: EntryDiff[] = [];
	for (const slug of new Set([...prevQty.keys(), ...currQty.keys()])) {
		const from = prevQty.get(slug);
		const to = currQty.get(slug);
		if (from === undefined && to !== undefined) {
			diffs.push({ kind: 'added', cardSlug: slug, quantity: to });
		} else if (from !== undefined && to === undefined) {
			diffs.push({ kind: 'removed', cardSlug: slug, quantity: from });
		} else if (from !== undefined && to !== undefined && from !== to) {
			diffs.push({ kind: 'changed', cardSlug: slug, from, to });
		}
	}
	return diffs;
}

/** `prev` is `null` for a deck's first version — diffs against an empty deck. */
export function diffVersions(prev: Version | null, curr: Version): VersionDiff {
	const prevLegends = new Set(prev?.legends ?? []);
	const currLegends = new Set(curr.legends);

	return {
		entries: diffEntries(prev?.entries ?? [], curr.entries),
		sideboard: diffEntries(prev?.sideboard ?? [], curr.sideboard),
		legendsAdded: curr.legends.filter((slug) => !prevLegends.has(slug)),
		legendsRemoved: [...prevLegends].filter((slug) => !currLegends.has(slug))
	};
}
