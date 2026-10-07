/**
 * Assertions against the *committed* `static/prices.json`, in the spirit of `assertions.spec.ts`
 * for cards: the file is generated, so these are what stops a hand edit or a stale refresh from
 * quietly breaking what the app reads.
 *
 * They deliberately say nothing about price *values* — those move daily — only about the file's
 * shape and what it is allowed to claim.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { dataset } from '../cards/index.ts';
import { printTreatment } from '../cards/derive.ts';
import { TCGPLAYER_GROUPS, runKey } from './marketplaces.ts';
import { runOf } from './mapping.ts';
import { PricesSchema, stringifyPrices } from './schema.ts';

const text = readFileSync('static/prices.json', 'utf8');
const prices = v.parse(PricesSchema, JSON.parse(text));
const printings = new Map(
	dataset.cards.flatMap((card) =>
		card.printings.map((printing) => [printing.id, printing] as const)
	)
);

describe('static/prices.json', () => {
	it('is exactly what `pnpm prices` writes, so a hand edit shows up here', () => {
		expect(text).toBe(stringifyPrices(prices));
	});

	it('only prices Printings that exist', () => {
		const unknown = Object.keys(prices.quotes).filter((id) => !printings.has(id));
		expect(unknown).toEqual([]);
	});

	it('never prices a French Printing — neither marketplace has a French run to borrow from', () => {
		const french = Object.keys(prices.quotes).filter((id) => printings.get(id)?.locale === 'fr');
		expect(french).toEqual([]);
	});

	it('joins every beta Printing in a mapped TCGplayer run', () => {
		const missing = [...printings.values()]
			.filter((printing) => printTreatment(printing) === 'beta')
			.filter((printing) => TCGPLAYER_GROUPS.has(runKey(runOf(printing))))
			.filter((printing) => prices.quotes[printing.id]?.tcgplayer === undefined)
			.map((printing) => printing.key);
		expect(missing).toEqual([]);
	});

	it('gives no two Printings the same marketplace product', () => {
		for (const side of ['tcgplayer', 'cardmarket'] as const) {
			const ids = Object.values(prices.quotes).flatMap((quote) => quote[side]?.productId ?? []);
			expect(new Set(ids).size, side).toBe(ids.length);
		}
	});

	it('records when each source last rebuilt, in the past', () => {
		const now = Date.now();
		for (const { updatedAt } of [prices.tcgplayer, prices.cardmarket]) {
			expect(Date.parse(updatedAt)).toBeLessThanOrEqual(now);
		}
	});
});
