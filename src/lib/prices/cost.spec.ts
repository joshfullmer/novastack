import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '../cards/fixtures.ts';
import type { Card } from '../cards/schema.ts';
import { cheapestOffer, costOfPrintings, costToComplete, deckCost } from './cost.ts';
import type { Quote } from './schema.ts';

const tcg = (productId: number, market: number | null): Quote => ({
	tcgplayer: { productId, market }
});
const cm = (productId: number, trend: number | null): Quote => ({
	cardmarket: { productId, trend }
});

function lookup(quotes: Record<string, Quote>) {
	return (printingId: string) => quotes[printingId];
}

/** A card with a retail printing, a beta printing and a French one, ids `<slug>-retail` etc. */
function threePrintings(slug: string): Card {
	return makeCard({
		slug,
		name: slug,
		printings: [
			makePrinting({ id: `${slug}-retail`, collectorNumber: '010' }),
			makePrinting({ id: `${slug}-beta`, collectorNumber: 'β010' }),
			makePrinting({ id: `${slug}-fr`, collectorNumber: '010', locale: 'fr' })
		]
	});
}

describe('cheapestOffer', () => {
	const card = threePrintings('chrome-fang');

	it('takes the cheapest priced English printing, beta included', () => {
		const quotes = lookup({
			'chrome-fang-retail': tcg(1, 500),
			'chrome-fang-beta': tcg(2, 20)
		});
		const offer = cheapestOffer(card, quotes, 'tcgplayer');
		expect(offer?.printing.id).toBe('chrome-fang-beta');
		expect(offer?.productId).toBe(2);
		expect(offer?.amount).toBe(20);
	});

	it('skips a printing with no price yet rather than reading it as free', () => {
		const quotes = lookup({
			'chrome-fang-retail': tcg(1, null),
			'chrome-fang-beta': tcg(2, 300)
		});
		expect(cheapestOffer(card, quotes, 'tcgplayer')?.amount).toBe(300);
	});

	it('never borrows the French printing, however cheap', () => {
		const quotes = lookup({ 'chrome-fang-fr': tcg(9, 1) });
		expect(cheapestOffer(card, quotes, 'tcgplayer')).toBeNull();
	});

	it('is null when nothing is priced, and per marketplace', () => {
		const quotes = lookup({ 'chrome-fang-beta': tcg(2, 20) });
		expect(cheapestOffer(card, quotes, 'cardmarket')).toBeNull();
		expect(cheapestOffer(card, () => undefined, 'tcgplayer')).toBeNull();
	});

	it('keeps the earlier printing on a tie', () => {
		const quotes = lookup({
			'chrome-fang-retail': tcg(1, 100),
			'chrome-fang-beta': tcg(2, 100)
		});
		expect(cheapestOffer(card, quotes, 'tcgplayer')?.printing.id).toBe('chrome-fang-retail');
	});
});

describe('cheapestOffer when Cardmarket could not identify a printing', () => {
	// Two English beta arts of one card, in a run Cardmarket covers. Only one joined.
	const card = makeCard({
		slug: 'adam-smasher',
		printings: [
			makePrinting({ id: 'standard', collectorNumber: 'β001' }),
			makePrinting({ id: 'iconic', collectorNumber: 'β141' })
		]
	});

	it('is unpriced there, not priced at whichever art did join', () => {
		const quotes = lookup({
			iconic: { ...cm(2, 10000), ...tcg(20, 10963) },
			standard: tcg(21, 91)
		});
		expect(cheapestOffer(card, quotes, 'cardmarket')).toBeNull();
	});

	it('does not touch TCGplayer, where an absent quote just means not listed', () => {
		const quotes = lookup({ iconic: tcg(20, 10963), standard: tcg(21, 91) });
		expect(cheapestOffer(card, quotes, 'tcgplayer')?.printing.id).toBe('standard');
	});

	it('prices it once every covered printing has a quote', () => {
		const quotes = lookup({ iconic: cm(2, 10000), standard: cm(1, 50) });
		expect(cheapestOffer(card, quotes, 'cardmarket')?.printing.id).toBe('standard');
	});

	it('ignores printings in runs Cardmarket does not cover — retail has no expansion', () => {
		const withRetail = makeCard({
			slug: 'chrome-fang',
			printings: [
				makePrinting({ id: 'beta', collectorNumber: 'β010' }),
				makePrinting({ id: 'retail', collectorNumber: '010' })
			]
		});
		const quotes = lookup({ beta: cm(1, 50) });
		expect(cheapestOffer(withRetail, quotes, 'cardmarket')?.amount).toBe(50);
	});
});

describe('costToComplete', () => {
	const fang = threePrintings('chrome-fang');
	const blade = threePrintings('mantis-blades');
	const ghost = threePrintings('ghost');

	const quotes = lookup({
		'chrome-fang-beta': { ...tcg(1, 25), ...cm(11, 20) },
		'mantis-blades-beta': tcg(2, 1000), // TCGplayer only
		'ghost-beta': tcg(3, null) // a product with no market
	});

	const report = costToComplete(
		[
			{ card: fang, copies: 3 },
			{ card: blade, copies: 1 },
			{ card: ghost, copies: 2 }
		],
		quotes
	);

	it('multiplies the cheapest price by the copies short, per marketplace', () => {
		expect(report.totals.tcgplayer.total).toBe(25 * 3 + 1000 * 1);
		expect(report.totals.cardmarket.total).toBe(20 * 3);
	});

	it('counts what a marketplace does not price as unpriced there, and leaves it out of the total', () => {
		expect(report.totals.tcgplayer).toMatchObject({
			priced: 2,
			pricedCopies: 4,
			unpriced: 1
		});
		expect(report.totals.cardmarket).toMatchObject({
			priced: 1,
			pricedCopies: 3,
			unpriced: 2
		});
	});

	it('keeps each row’s own offers, so the UI can say which printing', () => {
		const [first] = report.rows;
		expect(first.card.slug).toBe('chrome-fang');
		expect(first.offers.tcgplayer?.printing.id).toBe('chrome-fang-beta');
		expect(first.offers.cardmarket?.productId).toBe(11);
	});

	it('ignores cards that are not short, and is all zeroes for none', () => {
		const none = costToComplete([{ card: fang, copies: 0 }], quotes);
		expect(none.rows).toEqual([]);
		expect(none.totals.tcgplayer).toEqual({
			total: 0,
			priced: 0,
			pricedCopies: 0,
			unpriced: 0
		});
	});
});

describe('costOfPrintings', () => {
	const quotes = lookup({
		a: { ...tcg(1, 100), ...cm(11, 80) },
		b: tcg(2, 2500), // TCGplayer only
		c: tcg(3, null), // a product with no market yet
		d: cm(14, 5) // Cardmarket only
	});

	const totals = costOfPrintings(
		[
			{ printingId: 'a', quantity: 3 },
			{ printingId: 'b', quantity: 1 },
			{ printingId: 'c', quantity: 2 },
			{ printingId: 'd', quantity: 4 },
			{ printingId: 'unknown', quantity: 1 }
		],
		quotes
	);

	it('prices each entry at its own printing, times the copies wanted', () => {
		expect(totals.tcgplayer.total).toBe(100 * 3 + 2500 * 1);
		expect(totals.cardmarket.total).toBe(80 * 3 + 5 * 4);
	});

	it('counts what a marketplace cannot price as unpriced there — never borrowed, never free', () => {
		expect(totals.tcgplayer).toMatchObject({ priced: 2, pricedCopies: 4, unpriced: 3 });
		expect(totals.cardmarket).toMatchObject({ priced: 2, pricedCopies: 7, unpriced: 3 });
	});

	it('skips an entry wanted zero times, and is all zeroes for none', () => {
		const none = costOfPrintings([{ printingId: 'a', quantity: 0 }], quotes);
		expect(none.tcgplayer).toEqual({ total: 0, priced: 0, pricedCopies: 0, unpriced: 0 });
		expect(costOfPrintings([], quotes).cardmarket.total).toBe(0);
	});
});

describe('deckCost', () => {
	// Default printing is the retail copy; the beta is cheaper, the French has no listing.
	const fang = threePrintings('chrome-fang');
	const blade = threePrintings('mantis-blades');

	const quotes = lookup({
		'chrome-fang-retail': { ...tcg(1, 500), ...cm(11, 400) },
		'chrome-fang-beta': { ...tcg(2, 25), ...cm(12, 20) },
		'mantis-blades-beta': { ...tcg(3, 100), ...cm(13, 90) } // its retail copy has no market yet
	});

	it('prices a card with no chosen printing at its cheapest — not at its unpriced Default', () => {
		const { tcgplayer } = deckCost(
			[
				{ card: fang, quantity: 3 }, // default is retail, $5.00; cheapest is the $0.25 beta
				{ card: blade, quantity: 2 } // default is retail with no market yet
			],
			quotes
		);
		expect(tcgplayer.built).toMatchObject({ total: 25 * 3 + 100 * 2, priced: 2, unpriced: 0 });
	});

	it('gives a deck that chose nothing two identical figures', () => {
		const { tcgplayer } = deckCost([{ card: fang, quantity: 3 }], quotes);
		expect(tcgplayer.built).toEqual(tcgplayer.cheapest);
	});

	it('prices a chosen printing at that printing, not the cheapest — the gap is what the art costs', () => {
		const { tcgplayer, cardmarket } = deckCost(
			[{ card: fang, quantity: 3, printingId: 'chrome-fang-retail' }],
			quotes
		);
		expect(tcgplayer.built.total).toBe(500 * 3);
		expect(tcgplayer.cheapest.total).toBe(25 * 3);
		expect(cardmarket.built.total).toBe(400 * 3);
		expect(cardmarket.cheapest.total).toBe(20 * 3);
	});

	it('prices the cheapest way to field the same list, whichever printing it uses', () => {
		const { tcgplayer } = deckCost(
			[
				{ card: fang, quantity: 3 },
				{ card: blade, quantity: 2 }
			],
			quotes
		);
		expect(tcgplayer.cheapest).toMatchObject({ total: 25 * 3 + 100 * 2, priced: 2, unpriced: 0 });
	});

	it('does not swap a chosen printing nobody lists for a cheaper one — a French copy is unpriced', () => {
		const { tcgplayer } = deckCost(
			[{ card: fang, quantity: 1, printingId: 'chrome-fang-fr' }],
			quotes
		);
		expect(tcgplayer.built).toMatchObject({ total: 0, priced: 0, unpriced: 1 });
		expect(tcgplayer.cheapest.priced).toBe(1);
	});

	it('sums a card named twice, and lets the first entry choose its printing', () => {
		const { tcgplayer } = deckCost(
			[
				{ card: fang, quantity: 2, printingId: 'chrome-fang-retail' }, // main deck
				{ card: fang, quantity: 1 } // sideboard, no choice recorded
			],
			quotes
		);
		expect(tcgplayer.built).toMatchObject({ total: 500 * 3, priced: 1, pricedCopies: 3 });
	});

	it('treats a chosen printing that has left the dataset as no choice', () => {
		const { tcgplayer } = deckCost([{ card: fang, quantity: 1, printingId: 'gone' }], quotes);
		expect(tcgplayer.built.total).toBe(25);
	});

	it('is all zeroes for an empty list', () => {
		const { cardmarket } = deckCost([], quotes);
		expect(cardmarket.built).toEqual({ total: 0, priced: 0, pricedCopies: 0, unpriced: 0 });
		expect(cardmarket.cheapest.total).toBe(0);
	});
});

describe('deckCost: whether the art was customised', () => {
	const fang = threePrintings('chrome-fang'); // default retail $5.00, cheapest is the $0.25 beta
	const quotes = lookup({
		'chrome-fang-retail': tcg(1, 500),
		'chrome-fang-beta': tcg(2, 25)
	});
	const customised = (printingId?: string) =>
		deckCost([{ card: fang, quantity: 1, printingId }], quotes).tcgplayer.customised;

	it('is not, for a deck that chose nothing', () => {
		expect(customised()).toBe(false);
	});

	it('is not, when the choice is the Default Printing', () => {
		expect(customised('chrome-fang-retail')).toBe(false);
	});

	it('is not, when the choice is the cheapest', () => {
		expect(customised('chrome-fang-beta')).toBe(false);
	});

	it('is, when the choice is neither — here a French copy', () => {
		expect(customised('chrome-fang-fr')).toBe(true);
	});

	it('is, if any one card in the deck is dressed up, however plain the rest', () => {
		const blade = threePrintings('mantis-blades');
		const dressed = deckCost(
			[
				{ card: fang, quantity: 1, printingId: 'chrome-fang-beta' },
				{ card: blade, quantity: 1, printingId: 'mantis-blades-fr' }
			],
			quotes
		);
		expect(dressed.tcgplayer.customised).toBe(true);
	});

	it('judges "cheapest" per marketplace — a copy cheapest on one is not on the other', () => {
		const both = lookup({
			'chrome-fang-retail': { ...tcg(1, 500), ...cm(11, 10) },
			'chrome-fang-beta': { ...tcg(2, 25), ...cm(12, 400) }
		});
		const { tcgplayer, cardmarket } = deckCost(
			[{ card: fang, quantity: 1, printingId: 'chrome-fang-beta' }],
			both
		);
		expect(tcgplayer.customised).toBe(false); // the cheapest on TCGplayer
		expect(cardmarket.customised).toBe(true); // not the cheapest on Cardmarket, and not the default
	});
});
