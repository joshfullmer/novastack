/**
 * Deck legality (`legality.ts`) is pure functions over synthetic Card/DeckEntry fixtures — see
 * `docs/spec/deckbuilder.md` §2 and §4 for the rules these implement.
 */
import { describe, expect, it } from 'vitest';
import { makeCard } from '#lib/cards/fixtures.js';
import { EMPTY_BUDGET } from '#lib/filters/budget.js';
import {
	MAX_DECK_SIZE,
	MIN_DECK_SIZE,
	budgetFromLegends,
	deckIssues,
	deckSizeStatus,
	legendNameConflicts,
	ramViolations,
	type DeckEntry
} from './legality.js';

describe('budgetFromLegends', () => {
	it('sums each chosen Legend’s own ramProvided per color, not a slot count × a constant', () => {
		const legends = [
			makeCard({ color: 'Red', cardType: 'Legend', ramProvided: 2 }),
			makeCard({ color: 'Red', cardType: 'Legend', ramProvided: 3 }), // deliberately non-uniform
			makeCard({ color: 'Blue', cardType: 'Legend', ramProvided: 2 })
		];

		expect(budgetFromLegends(legends)).toEqual({ Red: 5, Blue: 2, Yellow: 0, Green: 0 });
	});

	it('is the empty budget for zero Legends', () => {
		expect(budgetFromLegends([])).toEqual(EMPTY_BUDGET);
	});

	it('treats a null ramProvided as zero', () => {
		const legends = [makeCard({ color: 'Green', cardType: 'Legend', ramProvided: null })];
		expect(budgetFromLegends(legends)).toEqual({ Red: 0, Yellow: 0, Green: 0, Blue: 0 });
	});
});

describe('deckSizeStatus', () => {
	it('is "under" below the minimum, "legal" within range, "over" above the maximum', () => {
		expect(deckSizeStatus(MIN_DECK_SIZE - 1)).toBe('under');
		expect(deckSizeStatus(MIN_DECK_SIZE)).toBe('legal');
		expect(deckSizeStatus(MAX_DECK_SIZE)).toBe('legal');
		expect(deckSizeStatus(MAX_DECK_SIZE + 1)).toBe('over');
	});
});

describe('ramViolations', () => {
	it('lists entries whose card the current budget does not admit', () => {
		const budget = { Red: 2, Yellow: 0, Green: 0, Blue: 0 };
		const withinBudget: DeckEntry = {
			card: makeCard({ color: 'Red', cardType: 'Unit', ramRequired: 2 }),
			quantity: 1
		};
		const overBudget: DeckEntry = {
			card: makeCard({ color: 'Red', cardType: 'Unit', ramRequired: 3 }),
			quantity: 1
		};
		const offColor: DeckEntry = {
			card: makeCard({ color: 'Blue', cardType: 'Unit', ramRequired: 0 }),
			quantity: 1
		};

		expect(ramViolations([withinBudget, overBudget, offColor], budget)).toEqual([
			overBudget,
			offColor
		]);
	});

	it('is empty when every entry is admitted, including the empty-deck case', () => {
		expect(ramViolations([], EMPTY_BUDGET)).toEqual([]);
	});

	it('flags every entry against an empty budget (zero Legends chosen)', () => {
		const entry: DeckEntry = {
			card: makeCard({ color: 'Red', cardType: 'Unit', ramRequired: 0 }),
			quantity: 1
		};
		expect(ramViolations([entry], EMPTY_BUDGET)).toEqual([entry]);
	});
});

describe('legendNameConflicts', () => {
	it('groups Legends that share a base name', () => {
		const v1 = makeCard({ cardType: 'Legend', name: 'V — Streetkid' });
		const v2 = makeCard({ cardType: 'Legend', name: 'V — Corporate Exile' });
		const goro = makeCard({ cardType: 'Legend', name: 'Goro Takemura — Hands Unclean' });

		expect(legendNameConflicts([v1, v2, goro])).toEqual([{ baseName: 'V', legends: [v1, v2] }]);
	});

	it('is empty when every chosen Legend has a distinct base name', () => {
		const legends = [
			makeCard({ cardType: 'Legend', name: 'V — Streetkid' }),
			makeCard({ cardType: 'Legend', name: 'Goro Takemura — Hands Unclean' }),
			makeCard({ cardType: 'Legend', name: 'Rebecca — Having a Moment' })
		];
		expect(legendNameConflicts(legends)).toEqual([]);
	});

	it('is empty for zero or one Legend', () => {
		expect(legendNameConflicts([])).toEqual([]);
		expect(legendNameConflicts([makeCard({ cardType: 'Legend', name: 'V — Streetkid' })])).toEqual(
			[]
		);
	});
});

describe('deckIssues', () => {
	const legal = {
		totalCards: MIN_DECK_SIZE,
		sizeStatus: 'legal' as const,
		violations: [],
		nameConflicts: []
	};

	it('is empty for a fully legal deck', () => {
		expect(deckIssues(legal)).toEqual([]);
	});

	it('reports an under-sized deck with the specific count and the legal minimum', () => {
		const issues = deckIssues({ ...legal, totalCards: 39, sizeStatus: 'under' });
		expect(issues).toEqual([
			{ kind: 'size', message: `Deck has 39 cards — the legal minimum is ${MIN_DECK_SIZE}.` }
		]);
	});

	it('reports an over-sized deck with the specific count and the legal maximum', () => {
		const issues = deckIssues({ ...legal, totalCards: 51, sizeStatus: 'over' });
		expect(issues).toEqual([
			{ kind: 'size', message: `Deck has 51 cards — the legal maximum is ${MAX_DECK_SIZE}.` }
		]);
	});

	it('reports RAM violations by card name', () => {
		const overBudget: DeckEntry = {
			card: makeCard({ name: 'Cyberdeck', cardType: 'Unit', ramRequired: 4 }),
			quantity: 1
		};
		const issues = deckIssues({ ...legal, violations: [overBudget] });
		expect(issues).toEqual([
			{ kind: 'ram', message: "1 card exceeds this deck's Legends' RAM: Cyberdeck." }
		]);
	});

	it('reports a Legend-name conflict by both full names and the shared base name', () => {
		const v1 = makeCard({ cardType: 'Legend', name: 'V — Streetkid' });
		const v2 = makeCard({ cardType: 'Legend', name: 'V — Corporate Exile' });
		const issues = deckIssues({
			...legal,
			nameConflicts: legendNameConflicts([v1, v2])
		});
		expect(issues).toEqual([
			{
				kind: 'legend-names',
				message: 'Legends can\'t share a name: V — Streetkid and V — Corporate Exile are both "V".'
			}
		]);
	});

	it('combines every kind of issue at once', () => {
		const overBudget: DeckEntry = {
			card: makeCard({ name: 'Cyberdeck', cardType: 'Unit', ramRequired: 4 }),
			quantity: 1
		};
		const v1 = makeCard({ cardType: 'Legend', name: 'V — Streetkid' });
		const v2 = makeCard({ cardType: 'Legend', name: 'V — Corporate Exile' });
		const issues = deckIssues({
			totalCards: 39,
			sizeStatus: 'under',
			violations: [overBudget],
			nameConflicts: legendNameConflicts([v1, v2])
		});
		expect(issues.map((issue) => issue.kind)).toEqual(['size', 'ram', 'legend-names']);
	});
});
