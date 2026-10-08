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

/** What each marketplace is called, what it prices in and how, and where its product pages are. */
export const MARKETPLACE_INFO: Record<
	Marketplace,
	{ name: string; currency: Currency; measure: string; url: (productId: number) => string }
> = {
	tcgplayer: { name: 'TCGplayer', currency: 'USD', measure: 'market price', url: tcgplayerUrl },
	cardmarket: { name: 'Cardmarket', currency: 'EUR', measure: 'trend price', url: cardmarketUrl }
};

export type Offer = {
	/** The Printing this price is for. */
	printing: Printing;
	productId: number;
	/** Integer minor units, in the marketplace's own currency. Never zero. */
	amount: number;
};

/**
 * A quote's listing on one marketplace: the product to link to, and its price if it has one yet.
 * `null` only when the marketplace does not list the Printing at all.
 */
export function listingOn(
	quote: Quote | undefined,
	marketplace: Marketplace
): { productId: number; amount: number | null } | null {
	const listing =
		marketplace === 'tcgplayer'
			? quote?.tcgplayer && { productId: quote.tcgplayer.productId, amount: quote.tcgplayer.market }
			: quote?.cardmarket && {
					productId: quote.cardmarket.productId,
					amount: quote.cardmarket.trend
				};
	return listing || null;
}

/** A listing that has a price — the cases a total can count. */
function listingOf(
	quote: Quote | undefined,
	marketplace: Marketplace
): { productId: number; amount: number } | null {
	const listing = listingOn(quote, marketplace);
	return listing && listing.amount !== null
		? { productId: listing.productId, amount: listing.amount }
		: null;
}

function offerFor(
	printing: Printing,
	quote: Quote | undefined,
	marketplace: Marketplace
): Offer | null {
	const listing = listingOf(quote, marketplace);
	return listing && { printing, ...listing };
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

/**
 * One marketplace's total over a list of things to buy. "Items" are whatever the list is made of —
 * cards for a deck's shortfall, Printings for a Wantlist — and the same arithmetic serves both.
 */
export type MarketplaceTotal = {
	/** `Σ copies × amount` over the items this marketplace prices, in minor units. */
	total: number;
	/** Distinct items it prices, and the copies of them. */
	priced: number;
	pricedCopies: number;
	/** Distinct items it has no price for — left out of `total`, and said so. */
	unpriced: number;
};

const emptyTotal = (): MarketplaceTotal => ({ total: 0, priced: 0, pricedCopies: 0, unpriced: 0 });

function tally(total: MarketplaceTotal, amount: number | null, copies: number): void {
	if (amount === null) {
		total.unpriced += 1;
		return;
	}
	total.total += amount * copies;
	total.priced += 1;
	total.pricedCopies += copies;
}

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

	const totals: Record<Marketplace, MarketplaceTotal> = {
		tcgplayer: emptyTotal(),
		cardmarket: emptyTotal()
	};
	for (const row of rows) {
		for (const marketplace of MARKETPLACES) {
			tally(totals[marketplace], row.offers[marketplace]?.amount ?? null, row.copies);
		}
	}

	return { rows, totals };
}

/**
 * What a list of *specific* Printings costs — a Wantlist, where each entry already names the
 * Printing it wants, so there is no "cheapest" to choose and no Card-level rollup.
 *
 * Each entry is priced at its own Printing's quote, per marketplace. A Printing a marketplace has no
 * price for is unpriced there; nothing is borrowed from a sibling Printing or the other marketplace.
 */
export function costOfPrintings(
	entries: readonly { printingId: string; quantity: number }[],
	quoteOf: (printingId: string) => Quote | undefined
): Record<Marketplace, MarketplaceTotal> {
	const totals: Record<Marketplace, MarketplaceTotal> = {
		tcgplayer: emptyTotal(),
		cardmarket: emptyTotal()
	};
	for (const { printingId, quantity } of entries) {
		if (quantity <= 0) continue;
		const quote = quoteOf(printingId);
		for (const marketplace of MARKETPLACES) {
			tally(totals[marketplace], listingOf(quote, marketplace)?.amount ?? null, quantity);
		}
	}
	return totals;
}

/** One decklist line: a card, how many, and the Printing the deck names for it, if it names one. */
export type DeckCostEntry = { card: Card; quantity: number; printingId?: string };

/**
 * What a whole decklist costs — the figure a player shows off, and the one a newcomer needs to
 * know — both ways, per marketplace:
 *
 * - **`built`: the deck as its owner made it.** Each card at the Printing the deck **chose** for it,
 *   so a deck dressed in expensive alt-arts says so. A card the deck chose no Printing for is priced
 *   at its cheapest instead: nobody asked for any particular art, so the cheapest is the honest
 *   stand-in — and the alternative, the Default Printing, is an English retail copy with no market
 *   price before 2026-11-06 and would read as an unpriced deck. A chosen Printing nobody lists (a
 *   French copy) is **not** swapped for a cheaper one: that choice was made, so it is unpriced.
 * - **`cheapest`: what it takes to field the list.** Each card at its cheapest priced English
 *   Printing (`cheapestOffer`), the same rule as a Wantlist built from a deck.
 *
 * **`customised`** is whether the two figures are worth telling apart: whether any card's chosen
 * Printing is neither its Default nor its cheapest on this marketplace. A deck that chose nothing,
 * or only Default or cheapest Printings, has no art premium to show, and the UI collapses to one
 * figure; otherwise the gap between the two is what the chosen art costs over the cheapest.
 *
 * Whole list, not a shortfall — nothing here knows or cares what anyone owns (`costToComplete` is
 * that). It covers everything needed to play it: the Legends, the main deck and the sideboard, as
 * the Collection tab does, so the two never disagree about what "the deck" is.
 *
 * Entries naming the same Card are summed first, and the first one's Printing wins, for the reason
 * `deckCollectionRows` gives: a card keeps one Printing across both piles. Items are distinct
 * cards, so "N of M" means the same here as everywhere else.
 */
export function deckCost(
	entries: readonly DeckCostEntry[],
	quoteOf: (printingId: string) => Quote | undefined
): Record<
	Marketplace,
	{ built: MarketplaceTotal; cheapest: MarketplaceTotal; customised: boolean }
> {
	const byCard = new Map<string, { card: Card; quantity: number; printingId?: string }>();
	for (const { card, quantity, printingId } of entries) {
		const existing = byCard.get(card.slug);
		if (existing) {
			existing.quantity += quantity;
			existing.printingId ??= printingId;
		} else {
			byCard.set(card.slug, { card, quantity, printingId });
		}
	}

	const totals = {
		tcgplayer: { built: emptyTotal(), cheapest: emptyTotal(), customised: false },
		cardmarket: { built: emptyTotal(), cheapest: emptyTotal(), customised: false }
	};

	for (const { card, quantity, printingId } of byCard.values()) {
		// A named Printing that has left the dataset counts as no choice, like everywhere else.
		const chosen = card.printings.find((printing) => printing.id === printingId);
		for (const marketplace of MARKETPLACES) {
			const offer = cheapestOffer(card, quoteOf, marketplace);
			const cheapest = offer?.amount ?? null;
			const built =
				chosen === undefined
					? cheapest
					: (listingOf(quoteOf(chosen.id), marketplace)?.amount ?? null);
			tally(totals[marketplace].built, built, quantity);
			tally(totals[marketplace].cheapest, cheapest, quantity);

			// A choice that is the Default or the cheapest is the baseline, not a statement about art.
			if (
				chosen !== undefined &&
				chosen.id !== card.printings[0].id &&
				chosen.id !== offer?.printing.id
			) {
				totals[marketplace].customised = true;
			}
		}
	}
	return totals;
}
