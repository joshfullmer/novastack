import { describe, expect, it } from 'vitest';
import { dataset } from '../cards/index.ts';
import { MAX_CARD_MATCHES, resolveCards } from './search.ts';

describe('resolveCards', () => {
	const mantis = dataset.cards.find((c) => c.slug.startsWith('mantis-blades'));

	it('finds a card by part of its name, ignoring case and spacing', () => {
		expect(mantis).toBeDefined();
		expect(resolveCards('mantis blades', dataset.cards)).toContain(mantis?.slug);
		expect(resolveCards('  MANTIS   ', dataset.cards)).toContain(mantis?.slug);
	});

	it('finds nothing for a name no card has, or for too little to go on', () => {
		expect(resolveCards('zzzzqqqq', dataset.cards)).toEqual([]);
		expect(resolveCards('m', dataset.cards)).toEqual([]);
		expect(resolveCards('   ', dataset.cards)).toEqual([]);
	});

	it('caps what it returns, so the filter stays a bounded query', () => {
		expect(resolveCards('e', dataset.cards)).toEqual([]); // too short
		expect(resolveCards('er', dataset.cards).length).toBeLessThanOrEqual(MAX_CARD_MATCHES);
	});
});
