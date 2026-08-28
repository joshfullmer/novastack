import { describe, expect, it } from 'vitest';
import {
	baseSetSequence,
	cardTypeRunsWithinColors,
	collectorNumberSortKey,
	deriveRamPerLegend,
	deriveSets,
	legendBaseName,
	runOrder,
	setExclusiveSlugs
} from './derive.ts';
import { makeCard, makePrinting } from './fixtures.ts';

describe('collectorNumberSortKey', () => {
	it('orders numerically, not lexically', () => {
		expect(
			['121', '9', '10'].sort((a, b) => collectorNumberSortKey(a)[0] - collectorNumberSortKey(b)[0])
		).toEqual(['9', '10', '121']);
	});

	it('reads through a β prefix and a letter suffix to the number', () => {
		expect(collectorNumberSortKey('β005a')).toEqual([5, 'β005a']);
	});

	it('parks a number-free collector number last rather than treating it as zero', () => {
		expect(collectorNumberSortKey('PROMO')[0]).toBe(Number.MAX_SAFE_INTEGER);
	});
});

describe('runOrder', () => {
	it('reports order of first appearance and one run per value when grouped', () => {
		expect(runOrder(['Red', 'Red', 'Yellow', 'Yellow', 'Green'])).toEqual({
			order: ['Red', 'Yellow', 'Green'],
			runs: 3
		});
	});

	it('reports more runs than values when the grouping is broken', () => {
		// This is the failure the assertion exists to catch: an order derived from an
		// interleaved sequence is not merely stale, it is meaningless.
		expect(runOrder(['Red', 'Yellow', 'Red'])).toEqual({ order: ['Red', 'Yellow'], runs: 3 });
	});

	it('reports nothing for an empty sequence', () => {
		expect(runOrder([])).toEqual({ order: [], runs: 0 });
	});
});

describe('baseSetSequence', () => {
	it('excludes beta printings by their β prefix and sorts by collector number', () => {
		const cards = [
			makeCard({
				color: 'Yellow',
				cardType: 'Unit',
				printings: [
					makePrinting({ setId: 'MS01-WNC', collectorNumber: '040' }),
					makePrinting({ setId: 'MS01-WNC', collectorNumber: 'β040' })
				]
			}),
			makeCard({
				color: 'Red',
				cardType: 'Legend',
				printings: [makePrinting({ setId: 'MS01-WNC', collectorNumber: '001' })]
			}),
			makeCard({
				color: 'Blue',
				cardType: 'Gear',
				printings: [makePrinting({ setId: 'SD01-HEI', collectorNumber: '001' })]
			})
		];

		expect(baseSetSequence(cards)).toEqual([
			{ color: 'Red', cardType: 'Legend', collectorNumber: '001' },
			{ color: 'Yellow', cardType: 'Unit', collectorNumber: '040' }
		]);
	});
});

describe('cardTypeRunsWithinColors', () => {
	it('counts runs within each color block, not globally', () => {
		const sequence = [
			{ color: 'Red', cardType: 'Legend' },
			{ color: 'Red', cardType: 'Unit' },
			{ color: 'Blue', cardType: 'Legend' },
			{ color: 'Blue', cardType: 'Unit' }
		] as const;

		// Four runs, not two: a color change restarts the run even when the type repeats.
		expect(cardTypeRunsWithinColors(sequence)).toEqual({ order: ['Legend', 'Unit'], runs: 4 });
	});
});

describe('deriveRamPerLegend', () => {
	it('returns the value and the evidence that it is uniform', () => {
		const cards = [
			makeCard({ cardType: 'Legend', ramProvided: 2 }),
			makeCard({ cardType: 'Legend', ramProvided: 2 }),
			makeCard({ cardType: 'Unit', ramRequired: 6, ramProvided: null })
		];
		expect(deriveRamPerLegend(cards)).toEqual({ value: 2, distinct: [2] });
	});

	it('ignores a Legend with no RAM at all', () => {
		const cards = [
			makeCard({ cardType: 'Legend', ramProvided: 2 }),
			makeCard({ cardType: 'Legend', ramProvided: null })
		];
		expect(deriveRamPerLegend(cards)).toEqual({ value: 2, distinct: [2] });
	});

	it('surfaces every distinct value so a non-uniform dataset fails the build', () => {
		const cards = [
			makeCard({ cardType: 'Legend', ramProvided: 3 }),
			makeCard({ cardType: 'Legend', ramProvided: 2 })
		];
		expect(deriveRamPerLegend(cards)).toEqual({ value: 3, distinct: [2, 3] });
	});
});

describe('deriveSets', () => {
	it('counts distinct cards and total printings per set', () => {
		const cards = [
			makeCard({
				printings: [
					makePrinting({ setId: 'MS01-WNC', collectorNumber: '001' }),
					makePrinting({ setId: 'MS01-WNC', collectorNumber: 'β001' })
				]
			}),
			makeCard({ printings: [makePrinting({ setId: 'SD01-HEI', collectorNumber: '001' })] })
		];

		const sets = deriveSets(cards);
		expect(sets.find((set) => set.id === 'MS01-WNC')).toMatchObject({
			cardCount: 1,
			printingCount: 2,
			kind: 'base',
			printed: 'MS01 - WNC [A]'
		});
		expect(sets.find((set) => set.id === 'SD01-HEI')).toMatchObject({
			cardCount: 1,
			printingCount: 1
		});
	});

	it('reports a set with no printings as zero rather than omitting it', () => {
		const sets = deriveSets([]);
		expect(sets).toHaveLength(8);
		expect(sets.every((set) => set.cardCount === 0)).toBe(true);
	});
});

describe('setExclusiveSlugs', () => {
	it('finds cards that were never printed in the Base Set', () => {
		const cards = [
			makeCard({ slug: 'in-base', printings: [makePrinting({ setId: 'MS01-WNC' })] }),
			makeCard({ slug: 'starter-only', printings: [makePrinting({ setId: 'SD01-HEI' })] })
		];
		expect(setExclusiveSlugs(cards)).toEqual(['starter-only']);
	});
});

describe('legendBaseName', () => {
	it('reads the part before the " — " separator', () => {
		expect(legendBaseName(makeCard({ cardType: 'Legend', name: 'V — Streetkid' }))).toBe('V');
	});

	it('is the whole name when there is no separator', () => {
		expect(legendBaseName(makeCard({ cardType: 'Legend', name: 'No Subtitle' }))).toBe(
			'No Subtitle'
		);
	});
});
