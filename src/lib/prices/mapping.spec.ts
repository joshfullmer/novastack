import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '../cards/fixtures.ts';
import type { Card } from '../cards/schema.ts';
import {
	buildPrices,
	collectorNumberKey,
	mapCardmarket,
	mapTcgplayer,
	nameKey,
	normalizeSourceTime
} from './mapping.ts';
import { PricesSchema, stringifyPrices } from './schema.ts';
import type {
	CardmarketPriceRow,
	CardmarketProduct,
	TcgcsvPrice,
	TcgcsvProduct
} from './sources.ts';
import * as v from 'valibot';

// Real ids from `marketplaces.ts`: WNC beta is TCGplayer group 24845 / Cardmarket expansion 6714,
// WNC retail is group 24855 (no Cardmarket expansion), and French has neither.
const WNC_BETA_GROUP = 24845;
const WNC_RETAIL_GROUP = 24855;
const WNC_BETA_EXPANSION = 6714;

function tcgProduct(
	productId: number,
	name: string,
	number: string,
	groupId = WNC_BETA_GROUP,
	presale = false
): TcgcsvProduct {
	return {
		productId,
		name,
		groupId,
		presaleInfo: { isPresale: presale },
		extendedData: [{ name: 'Number', value: number }]
	};
}

const tcgPrice = (productId: number, marketPrice: number | null): TcgcsvPrice => ({
	productId,
	marketPrice,
	subTypeName: 'Normal'
});

const cmProduct = (
	idProduct: number,
	name: string,
	idExpansion = WNC_BETA_EXPANSION
): CardmarketProduct => ({
	idProduct,
	name,
	idExpansion
});

const cmRow = (
	idProduct: number,
	trend: number | null,
	trendFoil: number | null = null
): CardmarketPriceRow => ({ idProduct, trend, 'trend-foil': trendFoil });

function cardWith(name: string, ...printings: Parameters<typeof makePrinting>[0][]): Card {
	const [first, ...rest] = printings.map((overrides) => makePrinting(overrides));
	return makeCard({ name, printings: [first, ...rest] });
}

describe('collectorNumberKey', () => {
	it("spells our β as TCGplayer's B", () => {
		expect(collectorNumberKey('β005a')).toBe('B005a');
		expect(collectorNumberKey('B037')).toBe('B037');
	});

	it('pads to three digits — one of our own numbers (`10`) is not', () => {
		expect(collectorNumberKey('10')).toBe('010');
		expect(collectorNumberKey('001')).toBe('001');
		expect(collectorNumberKey('β7')).toBe('B007');
	});

	it('leaves a number it does not understand alone', () => {
		expect(collectorNumberKey('PROMO-X')).toBe('PROMO-X');
	});
});

describe('nameKey', () => {
	it('makes the three marketplaces’ Legend separators equal', () => {
		const keys = ['V: Streetkid', 'V - Streetkid', 'V — Streetkid'].map(nameKey);
		expect(new Set(keys).size).toBe(1);
	});

	it('drops a trailing rarity or art marker, and folds accents', () => {
		expect(nameKey('Kerry Eurodyne - Axe (Rare)')).toBe(nameKey('Kerry Eurodyne: Axe'));
		expect(nameKey('V - Streetkid (b)')).toBe(nameKey('V: Streetkid'));
		expect(nameKey('Judy Álvarez')).toBe(nameKey('Judy Alvarez'));
	});

	it('does not strip a leading parenthetical', () => {
		expect(nameKey("(Don't Fear) The Reaper")).toBe('dontfearthereaper');
	});
});

describe('normalizeSourceTime', () => {
	it('reads both sources’ colon-less offsets', () => {
		expect(normalizeSourceTime('2026-10-06T20:04:45+0000')).toBe('2026-10-06T20:04:45.000Z');
		expect(normalizeSourceTime('2026-10-07T02:50:07+0200')).toBe('2026-10-07T00:50:07.000Z');
	});

	it('throws on something that is not a time', () => {
		expect(() => normalizeSourceTime('yesterday')).toThrow(/unreadable/);
	});
});

describe('mapTcgplayer', () => {
	it('joins a beta Printing on run and number, β spelled as B', () => {
		const card = cardWith('Chrome Fang', { collectorNumber: 'β012' });
		const { quotes, report } = mapTcgplayer([card], {
			products: [tcgProduct(900, 'Chrome Fang (b)', 'B012')],
			prices: [tcgPrice(900, 1.5)]
		});
		expect(quotes.get(card.printings[0].id)).toEqual({ productId: 900, market: 150 });
		expect(report.mapped).toBe(1);
	});

	it('never joins across runs: a retail number does not find the beta product', () => {
		const card = cardWith('Chrome Fang', { collectorNumber: '012' });
		const { quotes, report } = mapTcgplayer([card], {
			products: [tcgProduct(900, 'Chrome Fang', 'B012')],
			prices: [tcgPrice(900, 1.5)]
		});
		expect(quotes.size).toBe(0);
		expect(report.noProduct).toHaveLength(1);
	});

	it('links a presale product but gives it no price', () => {
		const card = cardWith('Chrome Fang', { collectorNumber: '012' });
		const { quotes } = mapTcgplayer([card], {
			products: [tcgProduct(901, 'Chrome Fang', '012', WNC_RETAIL_GROUP, true)],
			prices: [tcgPrice(901, 0.99)]
		});
		expect(quotes.get(card.printings[0].id)).toEqual({ productId: 901, market: null });
	});

	it('treats 0, null and a missing row alike as no price', () => {
		const cards = [
			cardWith('A', { collectorNumber: 'β001' }),
			cardWith('B', { collectorNumber: 'β002' }),
			cardWith('C', { collectorNumber: 'β003' })
		];
		const { quotes } = mapTcgplayer(cards, {
			products: [
				tcgProduct(1, 'A', 'B001'),
				tcgProduct(2, 'B', 'B002'),
				tcgProduct(3, 'C', 'B003')
			],
			prices: [tcgPrice(1, 0), tcgPrice(2, null)]
		});
		expect([...quotes.values()].map((quote) => quote.market)).toEqual([null, null, null]);
	});

	it('pads our unpadded number so `10` finds TCGplayer’s `010`', () => {
		const card = cardWith('Over the Edge', { collectorNumber: '10', setId: 'SD02-EBP' });
		const { quotes } = mapTcgplayer([card], {
			products: [tcgProduct(55, 'Over the Edge', '010', 24858)],
			prices: [tcgPrice(55, 0.1)]
		});
		expect(quotes.get(card.printings[0].id)?.productId).toBe(55);
	});

	it('reports a Printing in a run with no group — the French run — and does not price it', () => {
		const card = cardWith('Chrome Fang', { collectorNumber: '012', locale: 'fr' });
		const { quotes, report } = mapTcgplayer([card], {
			products: [tcgProduct(900, 'Chrome Fang', '012', WNC_RETAIL_GROUP)],
			prices: [tcgPrice(900, 1)]
		});
		expect(quotes.size).toBe(0);
		expect(report.noGroup).toEqual([card.printings[0].key]);
	});

	it('still joins on number when the name differs, and reports it', () => {
		const card = cardWith('Tetratronic Rippler', { collectorNumber: 'β020' });
		const { quotes, report } = mapTcgplayer([card], {
			products: [tcgProduct(7, 'Tetratonic Rippler', 'B020')],
			prices: [tcgPrice(7, 2)]
		});
		expect(quotes.size).toBe(1);
		expect(report.nameMismatches).toEqual([
			{ key: card.printings[0].key, ours: 'Tetratronic Rippler', theirs: 'Tetratonic Rippler' }
		]);
	});

	it('flags two Printings landing on one product', () => {
		const a = cardWith('A', { collectorNumber: '10', setId: 'SD02-EBP' });
		const b = cardWith('A', { collectorNumber: '010', setId: 'SD02-EBP' });
		const { report } = mapTcgplayer([a, b], {
			products: [tcgProduct(55, 'A', '010', 24858)],
			prices: []
		});
		expect(report.duplicateProducts).toHaveLength(1);
		expect(report.duplicateProducts[0].productId).toBe(55);
	});

	it('reads no price from a product with two rows, and says so', () => {
		const card = cardWith('A', { collectorNumber: 'β001' });
		const { quotes, report } = mapTcgplayer([card], {
			products: [tcgProduct(1, 'A', 'B001')],
			prices: [tcgPrice(1, 1), { ...tcgPrice(1, 2), subTypeName: 'Foil' }]
		});
		expect(quotes.get(card.printings[0].id)?.market).toBeNull();
		expect(report.ambiguous).toEqual([1]);
	});
});

describe('mapCardmarket', () => {
	it('joins a name that is unique in the expansion, on trend', () => {
		const card = cardWith('Chrome Fang', { collectorNumber: 'β012' });
		const { quotes, report } = mapCardmarket([card], {
			products: [cmProduct(10, 'Chrome Fang')],
			prices: [cmRow(10, 0.25)]
		});
		expect(quotes.get(card.printings[0].id)).toEqual({ productId: 10, trend: 25 });
		expect(report.mapped).toBe(1);
	});

	it('reads trend-foil for a foil rarity, where trend is 0', () => {
		const card = cardWith('Adam Smasher', { collectorNumber: 'β141' });
		const { quotes } = mapCardmarket([card], {
			products: [cmProduct(11, 'Adam Smasher')],
			prices: [cmRow(11, 0, 114.6)]
		});
		expect(quotes.get(card.printings[0].id)?.trend).toBe(11460);
	});

	it('links a product with no usable price, as null', () => {
		const card = cardWith('Chrome Fang', { collectorNumber: 'β012' });
		const { quotes } = mapCardmarket([card], {
			products: [cmProduct(10, 'Chrome Fang')],
			prices: [cmRow(10, 0, null)]
		});
		expect(quotes.get(card.printings[0].id)).toEqual({ productId: 10, trend: null });
	});

	it('does not guess between arts: two Printings of a card in one run join neither', () => {
		const card = cardWith('Adam Smasher', { collectorNumber: 'β141' }, { collectorNumber: 'β142' });
		const { quotes, report } = mapCardmarket([card], {
			products: [cmProduct(1, 'Adam Smasher'), cmProduct(2, 'Adam Smasher')],
			prices: [cmRow(1, 1), cmRow(2, 100)]
		});
		expect(quotes.size).toBe(0);
		expect(report.tied).toHaveLength(2);
	});

	it('does not guess when Cardmarket has two products but we have one Printing', () => {
		const card = cardWith('Adam Smasher', { collectorNumber: 'β141' });
		const { quotes, report } = mapCardmarket([card], {
			products: [cmProduct(1, 'Adam Smasher'), cmProduct(2, 'Adam Smasher')],
			prices: []
		});
		expect(quotes.size).toBe(0);
		expect(report.tied).toHaveLength(1);
	});

	it('joins only inside the curated expansion', () => {
		const card = cardWith('Chrome Fang', { collectorNumber: 'β012' });
		const { quotes, report } = mapCardmarket([card], {
			products: [cmProduct(10, 'Chrome Fang', 9999)],
			prices: []
		});
		expect(quotes.size).toBe(0);
		expect(report.nameNotFound).toHaveLength(1);
		expect(report.expansions.get(WNC_BETA_EXPANSION)).toEqual({ ours: 1, found: 0 });
	});

	it('skips a run with no expansion at all — retail and French', () => {
		const retail = cardWith('Chrome Fang', { collectorNumber: '012' });
		const french = cardWith('Chrome Fang', { collectorNumber: '012', locale: 'fr' });
		const { quotes, report } = mapCardmarket([retail, french], {
			products: [cmProduct(10, 'Chrome Fang')],
			prices: [cmRow(10, 1)]
		});
		expect(quotes.size).toBe(0);
		expect(report.expansions.size).toBe(0);
	});
});

describe('buildPrices', () => {
	const card = cardWith('Chrome Fang', { collectorNumber: 'β012' });
	const built = buildPrices(
		[card],
		{
			products: [tcgProduct(900, 'Chrome Fang', 'B012')],
			prices: [tcgPrice(900, 1.5)],
			updatedAt: '2026-10-06T20:04:45+0000'
		},
		{
			products: [cmProduct(10, 'Chrome Fang')],
			prices: [cmRow(10, 1.2)],
			updatedAt: '2026-10-07T02:50:07+0200'
		}
	);

	it('merges both marketplaces onto one Printing, with the sources’ own times', () => {
		expect(built.prices).toEqual({
			version: 1,
			tcgplayer: { updatedAt: '2026-10-06T20:04:45.000Z' },
			cardmarket: { updatedAt: '2026-10-07T00:50:07.000Z' },
			quotes: {
				[card.printings[0].id]: {
					tcgplayer: { productId: 900, market: 150 },
					cardmarket: { productId: 10, trend: 120 }
				}
			}
		});
	});

	it('produces a snapshot the schema accepts, and a stable one-line-per-quote file', () => {
		expect(() => v.parse(PricesSchema, built.prices)).not.toThrow();

		const text = stringifyPrices(built.prices);
		expect(JSON.parse(text)).toEqual(built.prices);
		expect(text.split('\n').filter((line) => line.includes(card.printings[0].id))).toHaveLength(1);
		expect(stringifyPrices(built.prices)).toBe(text);
	});
});
