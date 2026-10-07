/**
 * The price snapshot — `static/prices.json`, written by `pnpm prices`, read by the app.
 *
 * A **static asset fetched same-origin**, not bundled and not behind a Worker: the site's only
 * high-volume traffic is asset requests, which cost nothing, and a price file must be able to move
 * daily without re-shipping a 500 KB card snapshot (`docs/research/prices.md` §5).
 *
 * Money is **integer minor units** (USD cents, EUR cents) and **never zero**: both marketplaces use
 * `0` and `null` interchangeably for "no data", so the snapshot collapses them to `null`. A price
 * of nothing is not a price, and a total that quietly counted it as free would be wrong.
 *
 * A Printing absent from `quotes` has no marketplace product at all (every French printing today).
 * A Printing *present* with `null` has a product page to link to but no market price yet — the
 * state every retail Printing is in until 2026-11-06.
 */
import * as v from 'valibot';

const productId = v.pipe(v.number(), v.integer(), v.minValue(1));
const minorUnits = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)));

export const QuoteSchema = v.object({
	/** TCGplayer `productId`, and its market price in USD cents. */
	tcgplayer: v.optional(v.object({ productId, market: minorUnits })),
	/** Cardmarket `idProduct`, and its trend price in EUR cents. */
	cardmarket: v.optional(v.object({ productId, trend: minorUnits }))
});
export type Quote = v.InferOutput<typeof QuoteSchema>;

/** When the *source* last rebuilt, not when we ran — so an unchanged source is a no-op diff. */
const sourceTime = v.object({ updatedAt: v.pipe(v.string(), v.isoTimestamp()) });

export const PricesSchema = v.object({
	version: v.literal(1),
	tcgplayer: sourceTime,
	cardmarket: sourceTime,
	/** Keyed by Printing id (the UUID). */
	quotes: v.record(v.string(), QuoteSchema)
});
export type Prices = v.InferOutput<typeof PricesSchema>;

/**
 * One quote per line, keys sorted. `stableStringify` would indent every quote into ~10 lines; a
 * daily refresh then diffs as walls of braces. Here a price move is one changed line.
 */
export function stringifyPrices(prices: Prices): string {
	const lines = Object.keys(prices.quotes)
		.sort()
		.map((id) => `\t\t${JSON.stringify(id)}: ${JSON.stringify(sortKeys(prices.quotes[id]))}`);

	return [
		'{',
		`\t"cardmarket": ${JSON.stringify(prices.cardmarket)},`,
		'\t"quotes": {',
		lines.join(',\n'),
		'\t},',
		`\t"tcgplayer": ${JSON.stringify(prices.tcgplayer)},`,
		`\t"version": ${prices.version}`,
		'}',
		''
	].join('\n');
}

function sortKeys(quote: Quote): Quote {
	return {
		...(quote.cardmarket && { cardmarket: quote.cardmarket }),
		...(quote.tcgplayer && { tcgplayer: quote.tcgplayer })
	};
}
