/**
 * What it would cost to buy the cards a Deck is short of.
 *
 * **Missing is Card level** (`#lib/collection/missing.ts`): a Printing is cosmetic and any copy
 * plays, so the shortfall is a count of *cards*, and the question "what does that cost?" has to
 * pick a Printing to price. The honest pick is the **cheapest English Printing that has a price** —
 * what it takes to field the deck, not what the prettiest copy costs. English only, because the
 * French run has no marketplace listing to borrow from and the Default Printing is often an
 * expensive alt-art or has no price yet.
 *
 * Beta printings are included on purpose. Until English retail is on sale (2026-11-06) they are the
 * only priced copies, and leaving them out would price almost nothing. The cost is that a row can
 * be priced at a Printing the buyer did not have in mind, so every offer carries its Printing and
 * the UI says which.
 *
 * Each marketplace is totalled on its own, in its own currency, over the cards it prices; a card
 * one marketplace does not price is counted as unpriced *there*, never as free and never filled in
 * from the other. Mixing them would add TCGplayer dollars to Cardmarket euros.
 *
 * Pure, and takes quotes as a lookup rather than reading the store, like `missing.ts`.
 */
import type { Card, Printing } from '../cards/schema.ts';
import { DEFAULT_LOCALE } from '../cards/vocabulary.ts';
import type { Currency } from './format.ts';
import { cardmarketUrl, tcgplayerUrl } from './links.ts';
import { CARDMARKET_EXPANSIONS, runKey, runOf } from './marketplaces.ts';
import type { Quote } from './schema.ts';

export type Marketplace = 'tcgplayer' | 'cardmarket';
export const MARKETPLACES: readonly Marketplace[] = ['tcgplayer', 'cardmarket'];

/** What each marketplace is called, what it prices in, and where its product pages are. */
export const MARKETPLACE_INFO: Record<
	Marketplace,
	{ name: string; currency: Currency; url: (productId: number) => string }
> = {
	tcgplayer: { name: 'TCGplayer', currency: 'USD', url: tcgplayerUrl },
	cardmarket: { name: 'Cardmarket', currency: 'EUR', url: cardmarketUrl }
};

export type Offer = {
	/** The Printing this price is for. */
	printing: Printing;
	productId: number;
	/** Integer minor units, in the marketplace's own currency. Never zero. */
	amount: number;
};

function offerFor(
	printing: Printing,
	quote: Quote | undefined,
	marketplace: Marketplace
): Offer | null {
	const listing =
		marketplace === 'tcgplayer'
			? quote?.tcgplayer && { productId: quote.tcgplayer.productId, amount: quote.tcgplayer.market }
			: quote?.cardmarket && {
					productId: quote.cardmarket.productId,
					amount: quote.cardmarket.trend
				};

	return listing && listing.amount !== null
		? { printing, productId: listing.productId, amount: listing.amount }
		: null;
}

/**
 * Whether a marketplace's prices can be trusted to include the cheapest copy.
 *
 * Cardmarket's join can leave a Printing it *knows exists* unidentified — a name shared by several
 * arts that the tie-break could not safely pair (`mapping.ts`). Taking "the cheapest of what did
 * join" over such a card is not a lower bound but a guess in the wrong direction: the Printing it
 * dropped is usually the standard art, which is the cheap one. So if a Printing sits in a run
 * Cardmarket covers and has no Cardmarket quote, the whole Card is unpriced there.
 *
 * TCGplayer joins on collector number, so an absent quote means "not listed", which is a fact about
 * the market and not a gap in ours. Nothing to guard.
 */
function pricesAreComplete(
	card: Card,
	quoteOf: (printingId: string) => Quote | undefined,
	marketplace: Marketplace
): boolean {
	if (marketplace !== 'cardmarket') return true;
	return card.printings.every(
		(printing) =>
			printing.locale !== DEFAULT_LOCALE ||
			!CARDMARKET_EXPANSIONS.has(runKey(runOf(printing))) ||
			quoteOf(printing.id)?.cardmarket !== undefined
	);
}

/**
 * The cheapest priced English Printing of a Card on one marketplace, or `null` if none is — or if
 * the marketplace's join cannot say which is cheapest (`pricesAreComplete`).
 */
export function cheapestOffer(
	card: Card,
	quoteOf: (printingId: string) => Quote | undefined,
	marketplace: Marketplace
): Offer | null {
	if (!pricesAreComplete(card, quoteOf, marketplace)) return null;

	let best: Offer | null = null;
	for (const printing of card.printings) {
		if (printing.locale !== DEFAULT_LOCALE) continue;
		const offer = offerFor(printing, quoteOf(printing.id), marketplace);
		// Strictly cheaper, so a tie keeps the earlier Printing — the dataset's own order.
		if (offer !== null && (best === null || offer.amount < best.amount)) best = offer;
	}
	return best;
}

export type CostRow = {
	card: Card;
	/** Copies short — the Card-level `playableMissing`, not a Printing-scoped figure. */
	copies: number;
	offers: Record<Marketplace, Offer | null>;
};

export type MarketplaceTotal = {
	/** `Σ copies × amount` over the cards this marketplace prices, in minor units. */
	total: number;
	/** Distinct cards it prices, and the copies of them. */
	pricedCards: number;
	pricedCopies: number;
	/** Distinct short cards it has no price for — left out of `total`, and said so. */
	unpricedCards: number;
};

export type CostReport = {
	rows: CostRow[];
	totals: Record<Marketplace, MarketplaceTotal>;
};

export function costToComplete(
	short: readonly { card: Card; copies: number }[],
	quoteOf: (printingId: string) => Quote | undefined
): CostReport {
	const rows: CostRow[] = short
		.filter(({ copies }) => copies > 0)
		.map(({ card, copies }) => ({
			card,
			copies,
			offers: {
				tcgplayer: cheapestOffer(card, quoteOf, 'tcgplayer'),
				cardmarket: cheapestOffer(card, quoteOf, 'cardmarket')
			}
		}));

	const empty = (): MarketplaceTotal => ({
		total: 0,
		pricedCards: 0,
		pricedCopies: 0,
		unpricedCards: 0
	});
	const totals: Record<Marketplace, MarketplaceTotal> = {
		tcgplayer: empty(),
		cardmarket: empty()
	};

	for (const row of rows) {
		for (const marketplace of MARKETPLACES) {
			const offer = row.offers[marketplace];
			const tally = totals[marketplace];
			if (offer === null) {
				tally.unpricedCards += 1;
			} else {
				tally.total += offer.amount * row.copies;
				tally.pricedCards += 1;
				tally.pricedCopies += row.copies;
			}
		}
	}

	return { rows, totals };
}
