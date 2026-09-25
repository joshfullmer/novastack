/**
 * The `deck_versions` JSON payload — the boundary between a D1 text column and the typed value
 * the app trusts. Mirrors `#lib/cards/schema.ts`'s conventions: no coercion, `v.parse` is the
 * only route from JSON to a typed value.
 */
import * as v from 'valibot';
import { LEGEND_SLOTS, MAX_COPIES } from './legality.js';

export const DeckEntrySchema = v.object({
	/** The Card Id — see `CONTEXT.md`. */
	cardSlug: v.pipe(v.string(), v.nonEmpty()),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_COPIES)),
	/** Absent falls back to the Card's Default Printing. */
	printingId: v.optional(v.pipe(v.string(), v.nonEmpty()))
});
export type DeckEntryPayload = v.InferOutput<typeof DeckEntrySchema>;

export const DeckVersionPayloadSchema = v.object({
	entries: v.array(DeckEntrySchema),
	/** Up to 3 Legend card slugs. */
	legends: v.pipe(v.array(v.pipe(v.string(), v.nonEmpty())), v.maxLength(LEGEND_SLOTS)),
	/**
	 * The 7 (tournament rules §D.1 — `SIDEBOARD_SIZE`). Optional with an empty default, which
	 * collapses two things that should be one value: a row written before the `sideboard` column
	 * existed, and a deck deliberately built without one (legal — see `sideboardStatus`). Not
	 * capped at 7 here for the same reason `entries` isn't capped at 50 — an out-of-range pile is a
	 * reported `DeckIssue`, not a value too malformed to load.
	 */
	sideboard: v.optional(v.array(DeckEntrySchema), [])
});
export type DeckVersionPayload = v.InferOutput<typeof DeckVersionPayloadSchema>;
