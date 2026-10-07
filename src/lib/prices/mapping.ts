/**
 * Joining our Printings to the two marketplaces. Pure: it takes already-fetched, already-parsed
 * source data and returns a snapshot plus a report of everything that did not join cleanly.
 *
 * The two sources join differently, and the difference is the whole design:
 *
 * - **TCGplayer** carries the printed collector number (`B005a`, `001`), so a Printing joins on
 *   *run + number* — exact. The name is only a sanity check.
 * - **Cardmarket** has no collector number at all, so a Printing can only join on *expansion +
 *   name*, and only when that is unambiguous. Where a card has several arts in one run (the
 *   Iconic Legend and the standard art share a name) there is no honest way to tell them apart, so
 *   those are left unjoined and reported — never guessed. Positional guessing happened to agree
 *   with TCGplayer's price order in 30 of 30 ties (`docs/research/prices.md` §4.3), which is
 *   corroboration, not a rule to ship.
 *
 * Nothing here ever falls back from one run to another. Retail and beta are different products
 * with different prices, and a French Printing has no marketplace product to borrow.
 */
import { printTreatment } from '../cards/derive.ts';
import type { Card, Printing } from '../cards/schema.ts';
import { CARDMARKET_EXPANSIONS, TCGPLAYER_GROUPS, runKey, type Run } from './marketplaces.ts';
import type { Prices, Quote } from './schema.ts';
import type {
	CardmarketPriceRow,
	CardmarketProduct,
	TcgcsvPrice,
	TcgcsvProduct
} from './sources.ts';

export function runOf(printing: Printing): Run {
	return {
		setId: printing.setId,
		beta: printTreatment(printing) === 'beta',
		locale: printing.locale
	};
}

/**
 * Our collector number in TCGplayer's spelling: `β005a` → `B005a`, `10` → `010`.
 *
 * Padded because one of our own numbers is not (`Over the Edge` in SD02-EBP is `10`, where every
 * other is three digits), and TCGplayer's always are.
 */
export function collectorNumberKey(collectorNumber: string): string {
	const match = /^(β|B)?(\d+)([a-z]*)$/i.exec(collectorNumber.trim());
	if (match === null) return collectorNumber.trim();
	const [, prefix, digits, suffix] = match;
	return `${prefix === undefined ? '' : 'B'}${digits.padStart(3, '0')}${suffix.toLowerCase()}`;
}

/**
 * A name reduced to what survives the three marketplaces' spellings: `V: Streetkid`,
 * `V - Streetkid` and `V — Streetkid` all become `vstreetkid`, accents fold, and TCGplayer's
 * trailing `(b)` / `(Epic)` markers go. No card name ends in parentheses, so that strip is safe.
 */
export function nameKey(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/\s*\([a-z0-9 ]{1,15}\)\s*$/, '')
		.replace(/[^a-z0-9]+/g, '');
}

/** Leniently equal: marketplaces truncate and suffix names, and the number is what joins anyway. */
function namesAgree(ours: string, theirs: string): boolean {
	const a = nameKey(ours);
	const b = nameKey(theirs);
	return a === b || a.startsWith(b) || b.startsWith(a);
}

/** Dollars or euros → integer minor units, with `0`, `null` and absent all meaning "no price". */
function toMinor(amount: number | null | undefined): number | null {
	return amount !== null && amount !== undefined && amount > 0 ? Math.round(amount * 100) : null;
}

/**
 * TCGCSV spells times `2026-10-06T20:04:45+0000`; Cardmarket `2026-10-07T02:50:07+0200`. Neither has
 * the colon `Date` is guaranteed to accept in an offset.
 */
export function normalizeSourceTime(raw: string): string {
	const time = new Date(raw.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
	if (Number.isNaN(time.getTime())) throw new Error(`unreadable source timestamp: "${raw}"`);
	return time.toISOString();
}

function allPrintings(cards: readonly Card[]): { card: Card; printing: Printing }[] {
	return cards.flatMap((card) => card.printings.map((printing) => ({ card, printing })));
}

// ── TCGplayer ──────────────────────────────────────────────────────────────────────────────────

export type TcgplayerReport = {
	/** Printings in a run with no curated group (the French run, DD1/DD2, PRR02, NCS01). */
	noGroup: string[];
	/** Group exists, but no product carries this number. */
	noProduct: { key: string; run: string }[];
	/** Number joined, name did not: a typo on their side, or numbering drift on ours. */
	nameMismatches: { key: string; ours: string; theirs: string }[];
	/** Two of our Printings landed on one product. Always a bug. */
	duplicateProducts: { productId: number; keys: string[] }[];
	/** Products with more than one price row, so no single market price could be read. */
	ambiguous: number[];
	mapped: number;
};

export function mapTcgplayer(
	cards: readonly Card[],
	source: { products: readonly TcgcsvProduct[]; prices: readonly TcgcsvPrice[] }
): { quotes: Map<string, NonNullable<Quote['tcgplayer']>>; report: TcgplayerReport } {
	const byNumber = new Map<string, TcgcsvProduct[]>();
	for (const product of source.products) {
		const number = product.extendedData.find((entry) => entry.name === 'Number')?.value;
		if (number === undefined) continue; // sealed product
		const key = `${product.groupId}|${collectorNumberKey(number)}`;
		byNumber.set(key, [...(byNumber.get(key) ?? []), product]);
	}

	const pricesByProduct = new Map<number, TcgcsvPrice[]>();
	for (const price of source.prices) {
		pricesByProduct.set(price.productId, [...(pricesByProduct.get(price.productId) ?? []), price]);
	}

	const report: TcgplayerReport = {
		noGroup: [],
		noProduct: [],
		nameMismatches: [],
		duplicateProducts: [],
		ambiguous: [],
		mapped: 0
	};
	const quotes = new Map<string, NonNullable<Quote['tcgplayer']>>();
	const claimedBy = new Map<number, string[]>();

	for (const { card, printing } of allPrintings(cards)) {
		const run = runKey(runOf(printing));
		const groupId = TCGPLAYER_GROUPS.get(run);
		if (groupId === undefined) {
			report.noGroup.push(printing.key);
			continue;
		}

		const candidates = byNumber.get(`${groupId}|${collectorNumberKey(printing.collectorNumber)}`);
		if (candidates?.length !== 1) {
			report.noProduct.push({ key: printing.key, run });
			continue;
		}

		const [product] = candidates;
		if (!namesAgree(card.name, product.name)) {
			report.nameMismatches.push({ key: printing.key, ours: card.name, theirs: product.name });
		}

		const rows = pricesByProduct.get(product.productId) ?? [];
		if (rows.length > 1) report.ambiguous.push(product.productId);
		// A presale listing is not a market: its "price" is a placeholder until release.
		const market =
			rows.length === 1 && product.presaleInfo?.isPresale !== true
				? toMinor(rows[0].marketPrice)
				: null;

		quotes.set(printing.id, { productId: product.productId, market });
		claimedBy.set(product.productId, [...(claimedBy.get(product.productId) ?? []), printing.key]);
		report.mapped += 1;
	}

	for (const [productId, keys] of claimedBy) {
		if (keys.length > 1) report.duplicateProducts.push({ productId, keys });
	}
	return { quotes, report };
}

// ── Cardmarket ─────────────────────────────────────────────────────────────────────────────────

export type CardmarketReport = {
	/** Name is not unique in the expansion (or a card has several arts in the run): not guessed. */
	tied: string[];
	/** Expansion exists but nothing in it has this name. */
	nameNotFound: string[];
	/** How many of our Printings each curated expansion was asked about, and how many it knew. */
	expansions: Map<number, { ours: number; found: number }>;
	mapped: number;
};

/** Trend where there is one; foil rarities leave `trend` empty or 0 and carry `trend-foil`. */
function cardmarketPrice(row: CardmarketPriceRow | undefined): number | null {
	return toMinor(row?.trend) ?? toMinor(row?.['trend-foil']);
}

export function mapCardmarket(
	cards: readonly Card[],
	source: { products: readonly CardmarketProduct[]; prices: readonly CardmarketPriceRow[] }
): { quotes: Map<string, NonNullable<Quote['cardmarket']>>; report: CardmarketReport } {
	const byName = new Map<string, CardmarketProduct[]>();
	for (const product of source.products) {
		const key = `${product.idExpansion}|${nameKey(product.name)}`;
		byName.set(key, [...(byName.get(key) ?? []), product]);
	}
	const priceById = new Map(source.prices.map((row) => [row.idProduct, row]));

	const report: CardmarketReport = { tied: [], nameNotFound: [], expansions: new Map(), mapped: 0 };
	const quotes = new Map<string, NonNullable<Quote['cardmarket']>>();

	for (const card of cards) {
		for (const printing of card.printings) {
			const run = runKey(runOf(printing));
			const expansion = CARDMARKET_EXPANSIONS.get(run);
			if (expansion === undefined) continue;

			const sameRun = card.printings.filter((other) => runKey(runOf(other)) === run).length;
			const candidates = byName.get(`${expansion}|${nameKey(card.name)}`) ?? [];

			const tally = report.expansions.get(expansion) ?? { ours: 0, found: 0 };
			tally.ours += 1;
			if (candidates.length > 0) tally.found += 1;
			report.expansions.set(expansion, tally);

			if (candidates.length === 0) {
				report.nameNotFound.push(printing.key);
			} else if (candidates.length > 1 || sameRun > 1) {
				report.tied.push(printing.key);
			} else {
				const [product] = candidates;
				quotes.set(printing.id, {
					productId: product.idProduct,
					trend: cardmarketPrice(priceById.get(product.idProduct))
				});
				report.mapped += 1;
			}
		}
	}
	return { quotes, report };
}

// ── Together ───────────────────────────────────────────────────────────────────────────────────

export type PriceReport = { tcgplayer: TcgplayerReport; cardmarket: CardmarketReport };

export function buildPrices(
	cards: readonly Card[],
	tcgplayer: {
		products: readonly TcgcsvProduct[];
		prices: readonly TcgcsvPrice[];
		updatedAt: string;
	},
	cardmarket: {
		products: readonly CardmarketProduct[];
		prices: readonly CardmarketPriceRow[];
		updatedAt: string;
	}
): { prices: Prices; report: PriceReport } {
	const tcg = mapTcgplayer(cards, tcgplayer);
	const cm = mapCardmarket(cards, cardmarket);

	const quotes: Record<string, Quote> = {};
	for (const [id, quote] of tcg.quotes) quotes[id] = { ...quotes[id], tcgplayer: quote };
	for (const [id, quote] of cm.quotes) quotes[id] = { ...quotes[id], cardmarket: quote };

	return {
		prices: {
			version: 1,
			tcgplayer: { updatedAt: normalizeSourceTime(tcgplayer.updatedAt) },
			cardmarket: { updatedAt: normalizeSourceTime(cardmarket.updatedAt) },
			quotes
		},
		report: { tcgplayer: tcg.report, cardmarket: cm.report }
	};
}
