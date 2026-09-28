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

/**
 * One of the three Legend slots — a Card, and optionally which Printing of it the deck uses.
 *
 * **Accepts a bare slug or an object, and always produces an object.** Every `deck_versions` row
 * written before printings were choosable stores `legends` as `["royce-psycho-on-the-edge", …]`,
 * and those rows are the majority; migrating them would mean rewriting live JSON for no gain, since
 * a slug and `{ cardSlug }` mean exactly the same thing. So the union absorbs the old shape at the
 * boundary and everything downstream sees one type — the same trick `sideboard`'s default pulls for
 * rows written before that column existed.
 *
 * Writes always emit the object form (see `toPayload`), so the old shape is read-only and shrinks
 * over time on its own.
 */
export const LegendEntrySchema = v.union([
	v.pipe(
		v.string(),
		v.nonEmpty(),
		v.transform((cardSlug) => ({ cardSlug }) as { cardSlug: string; printingId?: string })
	),
	v.object({
		cardSlug: v.pipe(v.string(), v.nonEmpty()),
		/** Absent falls back to the Card's Default Printing, exactly as for a `DeckEntry`. */
		printingId: v.optional(v.pipe(v.string(), v.nonEmpty()))
	})
]);
export type LegendEntryPayload = v.InferOutput<typeof LegendEntrySchema>;

/**
 * The Legend slugs in a **raw** `deck_versions.legends` value, tolerating either stored shape.
 *
 * For the deck-list surfaces (`/decks`, `/explore`, `/f/[code]`), which read the column straight
 * off the row to render three thumbnails and never parse the whole payload. They predate the object
 * form, so without this they would silently render nothing the moment a deck saved a Legend
 * printing — a blank tile, no error. Anything that needs more than slugs should parse
 * `DeckVersionPayloadSchema` instead.
 */
export function legendSlugsFromJson(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((legend) => {
			if (typeof legend === 'string') return legend;
			if (legend !== null && typeof legend === 'object' && 'cardSlug' in legend) {
				const { cardSlug } = legend as { cardSlug: unknown };
				if (typeof cardSlug === 'string') return cardSlug;
			}
			return null;
		})
		.filter((slug): slug is string => slug !== null && slug.length > 0);
}

export const DeckVersionPayloadSchema = v.object({
	entries: v.array(DeckEntrySchema),
	/** Up to 3 Legends — see `LegendEntrySchema` for why a slug and an object are both accepted. */
	legends: v.pipe(v.array(LegendEntrySchema), v.maxLength(LEGEND_SLOTS)),
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
