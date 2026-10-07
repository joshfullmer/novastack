/**
 * The shapes of the two price sources, narrowed to the fields we read.
 *
 * Both are third-party files we do not control, so ingest-style rules apply: parse at the edge, and
 * let anything unexpected fail loudly rather than flow into the snapshot as `undefined`. Unknown
 * keys are dropped on purpose (`v.object` strips them) — Cardmarket has 14 price columns and we
 * read two.
 *
 * Where each comes from, and what was measured about them on 2026-10-07, is in
 * `docs/research/prices.md`.
 */
import * as v from 'valibot';

const money = v.nullable(v.number());

/** `tcgcsv.com/tcgplayer/92/groups` — one entry per product run, retail and beta separate. */
export const TcgcsvGroupsSchema = v.object({
	results: v.array(
		v.object({
			groupId: v.pipe(v.number(), v.integer()),
			name: v.string()
		})
	)
});
export type TcgcsvGroup = v.InferOutput<typeof TcgcsvGroupsSchema>['results'][number];

/** `tcgcsv.com/tcgplayer/92/{groupId}/products` — singles and sealed alike. */
export const TcgcsvProductsSchema = v.object({
	results: v.array(
		v.object({
			productId: v.pipe(v.number(), v.integer()),
			name: v.string(),
			groupId: v.pipe(v.number(), v.integer()),
			/** Absent on some products; `isPresale` is the only field of it that matters here. */
			presaleInfo: v.optional(v.object({ isPresale: v.boolean() })),
			/** `Number` ("B005a", "001") and `Rarity` live here, as name/value pairs. */
			extendedData: v.array(v.object({ name: v.string(), value: v.string() }))
		})
	)
});
export type TcgcsvProduct = v.InferOutput<typeof TcgcsvProductsSchema>['results'][number];

/** `tcgcsv.com/tcgplayer/92/{groupId}/prices` — at most one row per product in practice. */
export const TcgcsvPricesSchema = v.object({
	results: v.array(
		v.object({
			productId: v.pipe(v.number(), v.integer()),
			marketPrice: money,
			subTypeName: v.string()
		})
	)
});
export type TcgcsvPrice = v.InferOutput<typeof TcgcsvPricesSchema>['results'][number];

/** `price_guide_23.json` — Cardmarket's game id 23 is Cyberpunk. EUR, no currency field. */
export const CardmarketPriceGuideSchema = v.object({
	createdAt: v.string(),
	priceGuides: v.array(
		v.object({
			idProduct: v.pipe(v.number(), v.integer()),
			trend: v.optional(money),
			/** Foil rarities carry their price here and leave `trend` empty or 0. */
			'trend-foil': v.optional(money)
		})
	)
});
export type CardmarketPriceRow = v.InferOutput<
	typeof CardmarketPriceGuideSchema
>['priceGuides'][number];

/** `products_singles_23.json` — no collector number, no rarity, no expansion name. */
export const CardmarketSinglesSchema = v.object({
	createdAt: v.string(),
	products: v.array(
		v.object({
			idProduct: v.pipe(v.number(), v.integer()),
			name: v.string(),
			idExpansion: v.pipe(v.number(), v.integer())
		})
	)
});
export type CardmarketProduct = v.InferOutput<typeof CardmarketSinglesSchema>['products'][number];
