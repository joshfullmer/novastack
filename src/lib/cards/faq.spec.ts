import { describe, expect, it } from 'vitest';
import { groupFaqsByCardSlug, normalizeGeneralFaqs, segmentFaqText } from './faq.ts';
import { makeNetdeckFaq } from './fixtures.ts';

describe('segmentFaqText', () => {
	it('returns a single plain segment when there is no bracket', () => {
		expect(segmentFaqText('No brackets here.')).toEqual([
			{ text: 'No brackets here.', bold: false }
		]);
	});

	it('bolds a bracketed token and strips the brackets', () => {
		expect(segmentFaqText('If a Unit has [ADRENALINE], yes.')).toEqual([
			{ text: 'If a Unit has ', bold: false },
			{ text: 'ADRENALINE', bold: true },
			{ text: ', yes.', bold: false }
		]);
	});

	it('bolds a token verbatim, typos included', () => {
		expect(segmentFaqText('[ADRENALIINE] triggers once.')).toEqual([
			{ text: 'ADRENALIINE', bold: true },
			{ text: ' triggers once.', bold: false }
		]);
	});

	it('handles multiple brackets with no plain text between them', () => {
		expect(segmentFaqText('[PLAY][QUICK]')).toEqual([
			{ text: 'PLAY', bold: true },
			{ text: 'QUICK', bold: true }
		]);
	});

	it('handles a bracket at the very end with nothing trailing', () => {
		expect(segmentFaqText('Only if you control a [GO SOLO]')).toEqual([
			{ text: 'Only if you control a ', bold: false },
			{ text: 'GO SOLO', bold: true }
		]);
	});
});

describe('groupFaqsByCardSlug', () => {
	it('groups card-scope entries by slug, sorted by sortOrder', () => {
		const faqs = [
			makeNetdeckFaq({
				sort_order: 200,
				card: { id: 'c1', external_id: 'cb-a', name: 'A', slug: 'a', image_url: 'x' }
			}),
			makeNetdeckFaq({
				sort_order: 100,
				card: { id: 'c1', external_id: 'cb-a', name: 'A', slug: 'a', image_url: 'x' }
			}),
			makeNetdeckFaq({ scope: 'game', card: null })
		];

		const grouped = groupFaqsByCardSlug(faqs);
		expect(grouped.get('a')?.map((faq) => faq.sortOrder)).toEqual([100, 200]);
		expect(grouped.has('b')).toBe(false);
	});

	it('excludes game-scope entries even if one somehow carries a card', () => {
		const faqs = [
			makeNetdeckFaq({
				scope: 'game',
				card: { id: 'c1', external_id: 'cb-a', name: 'A', slug: 'a', image_url: 'x' }
			})
		];
		expect(groupFaqsByCardSlug(faqs).size).toBe(0);
	});
});

describe('normalizeGeneralFaqs', () => {
	it('keeps only game-scope entries, sorted by sortOrder', () => {
		const faqs = [
			makeNetdeckFaq({ scope: 'game', card: null, sort_order: 200 }),
			makeNetdeckFaq({
				card: { id: 'c1', external_id: 'cb-a', name: 'A', slug: 'a', image_url: 'x' }
			}),
			makeNetdeckFaq({ scope: 'game', card: null, sort_order: 100 })
		];

		expect(normalizeGeneralFaqs(faqs).map((faq) => faq.sortOrder)).toEqual([100, 200]);
	});
});
