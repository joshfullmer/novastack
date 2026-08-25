/**
 * Diffs two consecutive `deck_versions` rows for the deck view page's Change History section.
 *
 * Compares `entries` by `cardSlug` + `quantity` only — `printingId` is ignored, since printing
 * choice is cosmetic everywhere else in the app (RAM/legality never depend on it). Legend swaps
 * do count: they materially change what the deck can run.
 */
import type { DeckEntryPayload } from './schema.js';

export type EntryDiff =
	| { kind: 'added'; cardSlug: string; quantity: number }
	| { kind: 'removed'; cardSlug: string; quantity: number }
	| { kind: 'changed'; cardSlug: string; from: number; to: number };

export type VersionDiff = {
	entries: EntryDiff[];
	legendsAdded: string[];
	legendsRemoved: string[];
};

/** `prev` is `null` for a deck's first version — diffs against an empty deck. */
export function diffVersions(
	prev: { entries: DeckEntryPayload[]; legends: string[] } | null,
	curr: { entries: DeckEntryPayload[]; legends: string[] }
): VersionDiff {
	const prevQty = new Map((prev?.entries ?? []).map((e) => [e.cardSlug, e.quantity]));
	const currQty = new Map(curr.entries.map((e) => [e.cardSlug, e.quantity]));

	const entries: EntryDiff[] = [];
	for (const slug of new Set([...prevQty.keys(), ...currQty.keys()])) {
		const before = prevQty.get(slug);
		const after = currQty.get(slug);
		if (before === undefined && after !== undefined) {
			entries.push({ kind: 'added', cardSlug: slug, quantity: after });
		} else if (before !== undefined && after === undefined) {
			entries.push({ kind: 'removed', cardSlug: slug, quantity: before });
		} else if (before !== undefined && after !== undefined && before !== after) {
			entries.push({ kind: 'changed', cardSlug: slug, from: before, to: after });
		}
	}

	const prevLegends = new Set(prev?.legends ?? []);
	const currLegends = new Set(curr.legends);
	const legendsAdded = curr.legends.filter((slug) => !prevLegends.has(slug));
	const legendsRemoved = [...prevLegends].filter((slug) => !currLegends.has(slug));

	return { entries, legendsAdded, legendsRemoved };
}
