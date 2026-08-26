/**
 * The two schemas the pipeline runs through:
 *
 * ```
 * fetch  →  v.parse(NetdeckCardSchema, raw)   ← the API's shape; catches drift, field by field
 *        →  normalize()
 *        →  v.parse(SnapshotSchema, …)        ← our model; the single source of app types
 *        →  write cards.json
 * ```
 *
 * Types are always `v.InferOutput<…>` — never hand-maintained, never generated from the
 * data's accidents. Valibot is a runtime dependency because coercion is banned: `v.parse` is
 * the only route from JSON to a typed value.
 */
import * as v from 'valibot';
import { ParagraphSchema } from './rules-text.ts';
import { SetIdentifierSchema } from './sets.ts';
import {
	CardTypeSchema,
	ColorSchema,
	IMAGE_WIDTHS,
	KeywordSchema,
	RaritySchema,
	type ImageWidth
} from './vocabulary.ts';

// ---------------------------------------------------------------------------
// The source API's shape
// ---------------------------------------------------------------------------

const text = (field: string) => v.string(`${field}: expected a string`);
const nonEmptyText = (field: string) =>
	v.pipe(text(field), v.nonEmpty(`${field}: expected a non-empty string`));
const count = (field: string) => v.number(`${field}: expected a number`);

export const NetdeckPrintingSchema = v.object({
	id: nonEmptyText('printings[].id'),
	collector_number: nonEmptyText('printings[].collector_number'),
	set: v.object(
		{
			code: nonEmptyText('printings[].set.code'),
			name: nonEmptyText('printings[].set.name')
		},
		'printings[].set: expected an object'
	),
	rarity: RaritySchema,
	artist: nonEmptyText('printings[].artist'),
	/** Declared on every printing, `null` on all 389. Asserted still-null at ingest. */
	finish: v.nullable(text('printings[].finish')),
	/** Signed, ~24h TTL. Used during ingest and never stored. */
	image_url: nonEmptyText('printings[].image_url'),
	/** Stable identity, not fetchable. This is what invalidation diffs on. */
	source_image_url: nonEmptyText('printings[].source_image_url')
});
export type NetdeckPrinting = v.InferOutput<typeof NetdeckPrintingSchema>;

export const NetdeckCardSchema = v.object({
	id: nonEmptyText('id'),
	external_id: nonEmptyText('external_id'),
	slug: nonEmptyText('slug'),
	name: nonEmptyText('name'),
	subname: v.nullable(text('subname')),
	display_name: nonEmptyText('display_name'),
	rules_text: v.nullable(text('rules_text')),
	flavor_text: v.nullable(text('flavor_text')),
	color: ColorSchema,
	card_type: CardTypeSchema,
	cost: v.nullable(count('cost')),
	power: v.nullable(count('power')),
	/** One field, two opposite meanings. Split by card type in `normalize.ts`. */
	ram: v.nullable(count('ram')),
	classifications: v.array(nonEmptyText('classifications[]'), 'classifications: expected an array'),
	/** `[]` on all 133. The real keywords are `{Brace}` markup in `rules_text`. */
	keywords: v.array(text('keywords[]'), 'keywords: expected an array'),
	is_eddiable: v.boolean('is_eddiable: expected a boolean'),
	legality: nonEmptyText('legality'),
	/** `null` in list responses, a UUID in detail responses. */
	selected_printing_id: v.nullable(text('selected_printing_id')),
	printings: v.array(NetdeckPrintingSchema, 'printings: expected an array')
});
export type NetdeckCard = v.InferOutput<typeof NetdeckCardSchema>;

export const NetdeckPageSchema = v.object({
	items: v.array(NetdeckCardSchema, 'items: expected an array'),
	total: count('total')
});

// ---------------------------------------------------------------------------
// Our model
// ---------------------------------------------------------------------------

export const PrintingSchema = v.object({
	/** The UUID. Canonical for storage and for `static/card-art/{id}/{width}.webp`. */
	id: v.pipe(v.string(), v.nonEmpty()),
	/** Verbatim as printed, `β` included. */
	collectorNumber: v.pipe(v.string(), v.nonEmpty()),
	/** `<Category>-<Set Code>` — see `sets.ts`. */
	setId: v.pipe(v.string(), v.nonEmpty()),
	/**
	 * `<Category>-<Set Code>-<Collector Number>`. Unique across all printings, and the
	 * URL-facing key for a printing deep-link. The UUID stays canonical for storage.
	 */
	key: v.pipe(v.string(), v.nonEmpty()),
	rarity: RaritySchema,
	artist: v.pipe(v.string(), v.nonEmpty()),
	sourceImageUrl: v.pipe(v.string(), v.nonEmpty()),
	/** ThumbHash, base64. ~25 bytes; carries alpha, which every card image has. */
	thumbhash: v.pipe(v.string(), v.nonEmpty())
});
export type Printing = v.InferOutput<typeof PrintingSchema>;

export const CardSchema = v.object({
	/** The Card Id. Canonical everywhere — URLs, stored data, decklists. */
	slug: v.pipe(v.string(), v.nonEmpty()),
	/** `name` and `display_name` are byte-identical on all 133. One string, not three. */
	name: v.pipe(v.string(), v.nonEmpty()),
	color: ColorSchema,
	cardType: CardTypeSchema,
	cost: v.nullable(v.number()),
	power: v.nullable(v.number()),
	/** What a non-Legend demands of a deck. Never set on a Legend. */
	ramRequired: v.nullable(v.number()),
	/** What a Legend contributes to a deck. Never set on anything else. */
	ramProvided: v.nullable(v.number()),
	eddiable: v.boolean(),
	classifications: v.array(v.pipe(v.string(), v.nonEmpty())),
	keywords: v.array(KeywordSchema),
	rulesText: v.array(ParagraphSchema),
	flavorText: v.nullable(v.string()),
	/** The untouched original. The flavour split is fragile; this makes it re-runnable. */
	rawRulesText: v.nullable(v.string()),
	/** `printings[0]` is the Default Printing, guaranteed by ingest — hence the tuple. */
	printings: v.tupleWithRest([PrintingSchema], PrintingSchema)
});
export type Card = v.InferOutput<typeof CardSchema>;

export const SetSummarySchema = v.object({
	...SetIdentifierSchema.entries,
	cardCount: v.number(),
	printingCount: v.number()
});
export type SetSummary = v.InferOutput<typeof SetSummarySchema>;

export const StatsSchema = v.object({
	cards: v.number(),
	printings: v.number(),
	/**
	 * Genuine releases — **not** every printed Set Identifier. One today: Welcome to Night City.
	 *
	 * There are eight sources of cards, but seven of them are starter decks, demo decks, a
	 * box-topper run, promos and a prerelease. Counting those as "sets" claims eight releases for a
	 * game that has had one, which is the sort of number that reads as marketing rather than fact.
	 */
	sets: v.number()
});
export type Stats = v.InferOutput<typeof StatsSchema>;

export const SnapshotSchema = v.object({
	/** When `pnpm ingest` ran. The dataset is not stable — every count is a snapshot. */
	generatedAt: v.pipe(v.string(), v.isoTimestamp()),
	/** Derived from the Base Set's collector-number sequence, not hardcoded. */
	colorOrder: v.tupleWithRest([ColorSchema], ColorSchema),
	cardTypeOrder: v.tupleWithRest([CardTypeSchema], CardTypeSchema),
	/** Uniform across Legends today — asserted, because that is data and not a rule. */
	ramPerLegend: v.number(),
	sets: v.array(SetSummarySchema),
	stats: StatsSchema,
	cards: v.array(CardSchema)
});
export type Snapshot = v.InferOutput<typeof SnapshotSchema>;

// ---------------------------------------------------------------------------
// The landing page's own tiny artifact
// ---------------------------------------------------------------------------

/**
 * `/` must not import the dataset, or the landing page downloads every card to render a
 * search box. So ingest emits the seven hero cards and the stats line separately.
 */
export const LandingSchema = v.object({
	stats: StatsSchema,
	heroes: v.array(
		v.object({
			slug: v.pipe(v.string(), v.nonEmpty()),
			name: v.pipe(v.string(), v.nonEmpty()),
			color: ColorSchema,
			printingId: v.pipe(v.string(), v.nonEmpty()),
			thumbhash: v.pipe(v.string(), v.nonEmpty())
		})
	)
});
export type Landing = v.InferOutput<typeof LandingSchema>;

/**
 * `static/card-art/{printingId}/{width}.webp` — mirrored, never hotlinked.
 *
 * A separate top-level prefix rather than living under `/cards/`, which is the *route*
 * namespace. Two reasons: an immutable `Cache-Control` rule has to match the art and must not
 * match `/cards/[slug]` HTML, and `/cards/*` is the only glob that is unambiguously supported
 * in a Cloudflare `_headers` file. Keying by printing id is unchanged.
 */
export function cardImageUrl(printingId: string, width: ImageWidth): string {
	return `/card-art/${printingId}/${width}.webp`;
}

/**
 * The card detail page's printing-chooser query param — shared between its
 * `+page.server.ts` (resolves it per request, for Open Graph tags a non-JS crawler needs
 * correct on the very first response) and its `.svelte` file's own client-side chooser (which
 * re-resolves it reactively on every shallow navigation, without a server round trip). One
 * constant so the two can't drift apart on the param name.
 */
export const PRINTING_PARAM = 'printing';

/** A `srcset` across every mirrored tier, so the browser picks by rendered size. */
export function cardImageSrcset(printingId: string): string {
	return IMAGE_WIDTHS.map((width) => `${cardImageUrl(printingId, width)} ${width}w`).join(', ');
}
