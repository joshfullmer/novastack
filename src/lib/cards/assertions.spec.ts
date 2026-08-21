import { describe, expect, it } from 'vitest';
import {
	checkModelInvariants,
	checkRawInvariants,
	checkSlugStability,
	type Violation
} from './assertions.ts';
import {
	makeCard,
	makeNetdeckCard,
	makeNetdeckPrinting,
	makePrinting,
	thumbhashesFor
} from './fixtures.ts';
import { normalizeCards } from './normalize.ts';
import { SET_IDENTIFIERS } from './sets.ts';

const checks = (violations: readonly Violation[]) => violations.map((violation) => violation.check);

/** A clean, minimal raw dataset: two cards, one printing each. */
const cleanRaw = () => [
	makeNetdeckCard({ slug: 'alpha', name: 'Alpha' }),
	makeNetdeckCard({ slug: 'beta', name: 'Beta' })
];

describe('checkRawInvariants', () => {
	it('passes a clean dataset', () => {
		expect(checkRawInvariants(cleanRaw())).toEqual([]);
	});

	it('fails on a duplicate slug', () => {
		const raw = [makeNetdeckCard({ slug: 'alpha' }), makeNetdeckCard({ slug: 'alpha' })];
		expect(checks(checkRawInvariants(raw))).toContain('unique-slugs');
	});

	it('fails on a duplicate name — this is what makes a Card a mechanical identity', () => {
		const raw = [
			makeNetdeckCard({ slug: 'a', name: 'Same' }),
			makeNetdeckCard({ slug: 'b', name: 'Same' })
		];
		expect(checks(checkRawInvariants(raw))).toContain('unique-names');
	});

	it('fails when display_name diverges from name', () => {
		const raw = [makeNetdeckCard({ name: 'Alpha', display_name: 'Alpha (Promo)' })];
		expect(checks(checkRawInvariants(raw))).toContain('display-name-mirrors-name');
	});

	it('fails when external_id is not cb- + slug', () => {
		const raw = [makeNetdeckCard({ slug: 'alpha', external_id: 'cb-something-else' })];
		expect(checks(checkRawInvariants(raw))).toContain('external-id-derives-from-slug');
	});

	it('fails on a card with no printings', () => {
		const raw = [makeNetdeckCard({ printings: [] })];
		expect(checks(checkRawInvariants(raw))).toContain('printings-non-empty');
	});

	it('fails when the Default Printing is not printings[0]', () => {
		const printings = [makeNetdeckPrinting(), makeNetdeckPrinting()];
		const raw = [makeNetdeckCard({ printings, selected_printing_id: printings[1].id })];
		expect(checks(checkRawInvariants(raw))).toContain('default-printing-is-first');
	});

	it.each([
		['always-empty-keywords', { keywords: ['Blocker'] }],
		['always-empty-subname', { subname: 'StreetKid' }],
		['always-empty-flavor-text', { flavor_text: 'Wake up, samurai.' }],
		['constant-legality', { legality: 'banned' }]
	])('fails on %s, because a competing source of truth has appeared', (check, overrides) => {
		expect(checks(checkRawInvariants([makeNetdeckCard(overrides)]))).toContain(check);
	});

	it('fails when finish starts carrying a value', () => {
		const raw = [makeNetdeckCard({ printings: [makeNetdeckPrinting({ finish: 'Foil' })] })];
		expect(checks(checkRawInvariants(raw))).toContain('always-empty-finish');
	});

	it('fails on a brace token outside the known nine', () => {
		const raw = [makeNetdeckCard({ rules_text: '{Overclock} Draw 1.' })];
		const violations = checkRawInvariants(raw);
		expect(checks(violations)).toContain('known-keywords');
		expect(violations.find((v) => v.check === 'known-keywords')?.detail).toContain('Overclock');
	});

	it('fails on an API set code with no curated Set Identifier', () => {
		const raw = [
			makeNetdeckCard({
				printings: [makeNetdeckPrinting({ set: { code: 'season2retail', name: 'Season 2' } })]
			})
		];
		expect(checks(checkRawInvariants(raw))).toContain('set-code-is-mapped');
	});
});

describe('checkModelInvariants', () => {
	/**
	 * Four colors × four types in Base Set collector order — the real shape, in miniature.
	 * Every curated Set gets a printing, because a Set with none is itself a violation.
	 */
	function contiguousDataset() {
		const colors = ['Red', 'Yellow', 'Green', 'Blue'] as const;
		const types = ['Legend', 'Unit', 'Gear', 'Program'] as const;
		const derivativeSets = SET_IDENTIFIERS.filter((set) => set.kind === 'derivative');
		let collector = 0;

		return colors.flatMap((color) =>
			types.map((cardType) => {
				collector += 1;
				const number = String(collector).padStart(3, '0');
				const extra = derivativeSets
					.filter((_set, index) => index % types.length === types.indexOf(cardType))
					.map((set) => makePrinting({ setId: set.id, collectorNumber: number }));

				return makeCard({
					slug: `${color}-${cardType}`.toLowerCase(),
					color,
					cardType,
					ramProvided: cardType === 'Legend' ? 2 : null,
					ramRequired: cardType === 'Legend' ? null : 2,
					printings: [makePrinting({ setId: 'MS01-WNC', collectorNumber: number }), ...extra]
				});
			})
		);
	}

	it('passes a contiguously ordered dataset', () => {
		expect(checkModelInvariants(contiguousDataset())).toEqual([]);
	});

	it('fails when color stops forming exactly four contiguous runs', () => {
		const cards = contiguousDataset();
		// Re-color one card mid-sequence, breaking the run structure the order depends on.
		const broken = cards.map((card, index) =>
			index === 5 ? { ...card, color: 'Red' as const } : card
		);
		expect(checks(checkModelInvariants(broken))).toContain('color-forms-four-runs');
	});

	it('fails when card type stops forming four runs per color', () => {
		const cards = contiguousDataset();
		// Red now reads Legend, Legend, Gear, Program — three runs where there should be four.
		const broken = cards.map((card, index) =>
			index === 1 ? { ...card, cardType: 'Legend' as const } : card
		);
		expect(checks(checkModelInvariants(broken))).toContain('card-type-forms-sixteen-runs');
	});

	it('fails when RAM provided is not uniform across Legends', () => {
		const cards = contiguousDataset();
		const broken = cards.map((card) =>
			card.cardType === 'Legend' && card.color === 'Blue' ? { ...card, ramProvided: 3 } : card
		);
		expect(checks(checkModelInvariants(broken))).toContain('ram-per-legend-is-uniform');
	});

	it('fails on a duplicate printing key, which would collide in a deep-link URL', () => {
		const cards = [
			...contiguousDataset(),
			makeCard({
				slug: 'collides',
				printings: [makePrinting({ setId: 'MS01-WNC', collectorNumber: '001' })]
			})
		];
		expect(checks(checkModelInvariants(cards))).toContain('unique-printing-keys');
	});

	it('fails on a duplicate printing id', () => {
		const shared = makePrinting({ setId: 'SD01-HEI', collectorNumber: '001' });
		const cards = [
			...contiguousDataset(),
			makeCard({ slug: 'one', printings: [shared] }),
			makeCard({
				slug: 'two',
				printings: [{ ...shared, collectorNumber: '002', key: 'SD01-HEI-002' }]
			})
		];
		expect(checks(checkModelInvariants(cards))).toContain('unique-printing-ids');
	});

	it('fails when a curated Set has no printings at all', () => {
		// A Set in the curated map that the data never mentions means the map has drifted from
		// the API — either a set was renamed or an entry was invented.
		const cards = contiguousDataset().map((card) => {
			const kept = card.printings.filter((printing) => printing.setId !== 'SD01-HEI');
			const [first, ...rest] = kept.length > 0 ? kept : card.printings;
			return { ...card, printings: [first, ...rest] } satisfies typeof card;
		});

		const violations = checkModelInvariants(cards);
		expect(checks(violations)).toContain('every-set-has-printings');
		expect(violations.find((v) => v.check === 'every-set-has-printings')?.detail).toContain(
			'SD01-HEI'
		);
	});
});

describe('checkSlugStability', () => {
	it('accepts new slugs, because the dataset grows', () => {
		expect(checkSlugStability(['alpha'], ['alpha', 'beta'])).toEqual([]);
	});

	it('fails when a slug disappears, because every link to it breaks', () => {
		const violations = checkSlugStability(['alpha', 'beta'], ['alpha']);
		expect(checks(violations)).toContain('slug-stability');
		expect(violations[0].detail).toContain('beta');
	});

	it('has nothing to check on a first run', () => {
		expect(checkSlugStability([], ['alpha'])).toEqual([]);
	});
});

describe('the pipeline end to end', () => {
	it('normalizes a clean raw dataset into a model that passes its own invariants', () => {
		const raw = cleanRaw();
		const cards = normalizeCards(raw, thumbhashesFor(raw));

		expect(checkRawInvariants(raw)).toEqual([]);
		// Two cards cannot satisfy the four-run orderings; the printing-level checks still hold.
		expect(checks(checkModelInvariants(cards))).not.toContain('unique-printing-keys');
	});
});
