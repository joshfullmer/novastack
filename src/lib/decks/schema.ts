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
	legends: v.pipe(v.array(v.pipe(v.string(), v.nonEmpty())), v.maxLength(LEGEND_SLOTS))
});
export type DeckVersionPayload = v.InferOutput<typeof DeckVersionPayloadSchema>;
