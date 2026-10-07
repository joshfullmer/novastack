import { describe, expect, it } from 'vitest';
import { cardmarketUrl, tcgplayerUrl } from './links.ts';
import {
	EXPIRED_AFTER_MS,
	STALE_AFTER_MS,
	formatMoney,
	formatUpdated,
	freshness
} from './format.ts';

describe('formatMoney', () => {
	it('puts the symbol first, with grouping and two decimals', () => {
		expect(formatMoney(16, 'USD')).toBe('$0.16');
		expect(formatMoney(157650, 'USD')).toBe('$1,576.50');
		expect(formatMoney(2000, 'EUR')).toBe('€20.00');
	});
});

describe('freshness', () => {
	const updatedAt = '2026-10-07T00:00:00.000Z';
	const at = (offsetMs: number) => Date.parse(updatedAt) + offsetMs;

	it('is fresh within two days, stale after, and expired after a week', () => {
		expect(freshness(updatedAt, at(0))).toBe('fresh');
		expect(freshness(updatedAt, at(STALE_AFTER_MS))).toBe('fresh');
		expect(freshness(updatedAt, at(STALE_AFTER_MS + 1))).toBe('stale');
		expect(freshness(updatedAt, at(EXPIRED_AFTER_MS))).toBe('stale');
		expect(freshness(updatedAt, at(EXPIRED_AFTER_MS + 1))).toBe('expired');
	});
});

describe('formatUpdated', () => {
	it('is a short date', () => {
		// Noon UTC, so no timezone puts it on a different day.
		expect(formatUpdated('2026-10-07T12:00:00.000Z')).toBe('Oct 7');
	});
});

describe('links', () => {
	it('builds the product pages', () => {
		expect(tcgplayerUrl(714167)).toBe('https://www.tcgplayer.com/product/714167');
		expect(cardmarketUrl(905138)).toBe(
			'https://www.cardmarket.com/en/Cyberpunk/Products?idProduct=905138'
		);
	});
});
