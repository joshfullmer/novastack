/**
 * `pnpm prices` — refreshes `static/prices.json` from TCGplayer (via TCGCSV) and Cardmarket.
 *
 * ```
 * TCGCSV  last-updated + groups + (products, prices) per curated group  ┐
 * Cardmarket  price_guide_23.json + products_singles_23.json            ┴→ v.parse each
 *   → join onto Printing ids      (buildPrices)
 *   → assert the join             (checkPriceInvariants)
 *   → v.parse(PricesSchema) → write static/prices.json
 * ```
 *
 * Why these two sources and not the marketplaces' own APIs: both APIs are closed to new
 * applicants, and TCGCSV is a daily export of TCGplayer's. The whole case, the measured match
 * rates and what could be lost are in `docs/research/prices.md`. TCGCSV is a one-person hobby
 * service, so this script is written to lose it gracefully: any failure here leaves the committed
 * file untouched, and the file carries the source's own timestamps so staleness shows.
 *
 * Run on demand. The build never touches the network.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as v from 'valibot';
import { formatViolations } from '../src/lib/cards/assertions.ts';
import { SnapshotSchema } from '../src/lib/cards/schema.ts';
import { checkPriceInvariants, unknownTcgplayerGroups } from '../src/lib/prices/assertions.ts';
import { buildPrices, type PriceReport } from '../src/lib/prices/mapping.ts';
import { TCGPLAYER_GROUPS } from '../src/lib/prices/marketplaces.ts';
import { PricesSchema, stringifyPrices, type Prices } from '../src/lib/prices/schema.ts';
import {
	CardmarketPriceGuideSchema,
	CardmarketSinglesSchema,
	TcgcsvGroupsSchema,
	TcgcsvPricesSchema,
	TcgcsvProductsSchema
} from '../src/lib/prices/sources.ts';
import { fetchJson } from './lib/http.ts';

const CARDS_PATH = path.join('src', 'lib', 'cards', 'cards.json');
const PRICES_PATH = path.join('static', 'prices.json');

const TCGCSV = 'https://tcgcsv.com';
const TCGPLAYER_CATEGORY = 92; // "Cyberpunk TCG"
const CARDMARKET = 'https://downloads.s3.cardmarket.com/productCatalog';
const CARDMARKET_GAME = 23; // Cyberpunk

/** TCGCSV asks for an identifying agent, a pause between requests, and one pull per day. */
const HEADERS = { 'user-agent': 'novastack/1.0 (+https://novastack.gg)' };
const REQUEST_GAP_MS = 100;

/**
 * `--check` fetches and joins exactly as a real run does, then reports what *would* change and
 * writes nothing. Exit codes are the interface, as for `pnpm ingest:check`:
 *
 * - `0` — the committed file is current
 * - `1` — it would move (a normal answer, not a failure)
 * - `2` — an invariant was violated, or the run could not complete
 */
const check = process.argv.includes('--check');

const log = (message: string) => console.log(message);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const onRetry = ({ url, attempt, reason }: { url: string; attempt: number; reason: string }) =>
	log(`  retry ${attempt} ${url} — ${reason}`);
const options = { headers: HEADERS, onRetry };

async function main() {
	const cards = v.parse(SnapshotSchema, JSON.parse(await readFile(CARDS_PATH, 'utf8'))).cards;
	const previousText = await readFile(PRICES_PATH, 'utf8').catch(() => null);
	const previous: Prices | null =
		previousText === null ? null : v.parse(PricesSchema, JSON.parse(previousText));

	log('fetching TCGplayer prices via TCGCSV …');
	const tcgplayerUpdatedAt = await fetchUpdatedAt();
	const listing = await fetchJson(
		`${TCGCSV}/tcgplayer/${TCGPLAYER_CATEGORY}/groups`,
		TcgcsvGroupsSchema,
		options
	);

	const products = [];
	const prices = [];
	for (const groupId of [...TCGPLAYER_GROUPS.values()].sort((a, b) => a - b)) {
		const base = `${TCGCSV}/tcgplayer/${TCGPLAYER_CATEGORY}/${groupId}`;
		await sleep(REQUEST_GAP_MS);
		products.push(...(await fetchJson(`${base}/products`, TcgcsvProductsSchema, options)).results);
		await sleep(REQUEST_GAP_MS);
		prices.push(...(await fetchJson(`${base}/prices`, TcgcsvPricesSchema, options)).results);
	}

	log('fetching Cardmarket price guide and catalogue …');
	const guide = await fetchJson(
		`${CARDMARKET}/priceGuide/price_guide_${CARDMARKET_GAME}.json`,
		CardmarketPriceGuideSchema,
		options
	);
	const singles = await fetchJson(
		`${CARDMARKET}/productList/products_singles_${CARDMARKET_GAME}.json`,
		CardmarketSinglesSchema,
		options
	);

	const { prices: snapshot, report } = buildPrices(
		cards,
		{ products, prices, updatedAt: tcgplayerUpdatedAt },
		{ products: singles.products, prices: guide.priceGuides, updatedAt: guide.createdAt }
	);
	v.parse(PricesSchema, snapshot);

	const violations = checkPriceInvariants(report);
	if (violations.length > 0) {
		console.error(
			`\n✗ ${violations.length} invariant${violations.length === 1 ? '' : 's'} violated — ` +
				`nothing written, the committed file is untouched:\n${formatViolations(violations)}\n`
		);
		process.exit(2);
	}

	for (const group of unknownTcgplayerGroups(listing.results)) {
		log(
			`! TCGplayer group ${group.groupId} "${group.name}" is in neither TCGPLAYER_GROUPS nor ` +
				`IGNORED_TCGPLAYER_GROUPS — decide in src/lib/prices/marketplaces.ts`
		);
	}
	for (const line of describe(snapshot, report, cards.flatMap((card) => card.printings).length)) {
		log(line);
	}

	const next = stringifyPrices(snapshot);
	if (check) {
		if (next === previousText) {
			log('\n✓ no price updates — the committed file is current');
			process.exit(0);
		}
		log(`\n! prices have changed: ${describeChanges(previous, snapshot)}`);
		log('Run `pnpm prices` to apply it.');
		process.exit(1);
	}

	if (next === previousText) return log('\n✓ prices unchanged');
	await writeFile(PRICES_PATH, next);
	log(`\n✓ prices written to ${PRICES_PATH}`);
	if (previous !== null) log(`  ${describeChanges(previous, snapshot)}`);
}

/** TCGCSV publishes its own rebuild time; that, not our clock, is what the file should carry. */
async function fetchUpdatedAt(): Promise<string> {
	const url = `${TCGCSV}/last-updated.txt`;
	const response = await fetch(url, { headers: HEADERS });
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return (await response.text()).trim();
}

function describe(snapshot: Prices, report: PriceReport, printings: number): string[] {
	const quotes = Object.values(snapshot.quotes);
	const tcgplayer = quotes.filter((quote) => quote.tcgplayer !== undefined);
	const cardmarket = quotes.filter((quote) => quote.cardmarket !== undefined);
	const tcgplayerPriced = tcgplayer.filter((quote) => (quote.tcgplayer?.market ?? null) !== null);
	const cardmarketPriced = cardmarket.filter((quote) => (quote.cardmarket?.trend ?? null) !== null);

	return [
		`\n  TCGplayer   ${tcgplayer.length}/${printings} printings joined, ${tcgplayerPriced.length} priced`,
		`              ${report.tcgplayer.noGroup.length} in a run with no group, ` +
			`${report.tcgplayer.noProduct.length} with a group but no matching number, ` +
			`${report.tcgplayer.nameMismatches.length} name mismatch(es)`,
		`  Cardmarket  ${cardmarket.length}/${printings} printings joined, ${cardmarketPriced.length} priced`,
		`              ${report.cardmarket.paired} paired by price order, ` +
			`${report.cardmarket.tied.length} left unjoined as ambiguous, ` +
			`${report.cardmarket.nameNotFound.length} name(s) not found`,
		`  sources     TCGplayer ${snapshot.tcgplayer.updatedAt} · Cardmarket ${snapshot.cardmarket.updatedAt}`
	];
}

function describeChanges(previous: Prices | null, next: Prices): string {
	if (previous === null) return `new file, ${Object.keys(next.quotes).length} quotes`;
	const ids = new Set([...Object.keys(previous.quotes), ...Object.keys(next.quotes)]);
	let added = 0;
	let removed = 0;
	let moved = 0;
	for (const id of ids) {
		const before = previous.quotes[id];
		const after = next.quotes[id];
		if (before === undefined) added += 1;
		else if (after === undefined) removed += 1;
		else if (JSON.stringify(before) !== JSON.stringify(after)) moved += 1;
	}
	return `${added} added, ${removed} removed, ${moved} changed`;
}

try {
	await main();
} catch (error) {
	console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
	process.exit(2);
}
