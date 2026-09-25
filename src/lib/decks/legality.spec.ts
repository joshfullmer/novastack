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
	SIDEBOARD_SIZE,
	budgetFromLegends,
	combinedEntries,
	copiesOf,
	deckIssues,
	deckSizeStatus,
	legendNameConflicts,
	notLegalCards,
	ramViolations,
	sideboardStatus,
	type DeckEntry
} from './legality.js';

/** A Legend fixture with an explicit base name and subtitle, matching the real API shape. */
const legend = (name: string, subtitle: string) =>
	makeCard({ cardType: 'Legend', name: `${name}: ${subtitle}`, subtitle });

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

describe('sideboardStatus', () => {
	it('treats an empty sideboard as legal, not unfinished — tournament rules §C.2.2', () => {
		expect(sideboardStatus(0)).toBe('empty');
	});

	it('is "incomplete" between 1 and 6, "legal" at exactly 7, "over" above it', () => {
		expect(sideboardStatus(1)).toBe('incomplete');
		expect(sideboardStatus(SIDEBOARD_SIZE - 1)).toBe('incomplete');
		expect(sideboardStatus(SIDEBOARD_SIZE)).toBe('legal');
		expect(sideboardStatus(SIDEBOARD_SIZE + 1)).toBe('over');
	});
});

describe('combinedEntries', () => {
	it('sums quantities per card across both piles', () => {
		const shared = makeCard({ slug: 'chrome-fang', cardType: 'Unit' });
		const mainOnly = makeCard({ slug: 'militech', cardType: 'Gear' });

		expect(
			combinedEntries(
				[
					{ card: shared, quantity: 2 },
					{ card: mainOnly, quantity: 1 }
				],
				[{ card: shared, quantity: 1 }]
			)
		).toEqual([
			{ card: shared, quantity: 3 },
			{ card: mainOnly, quantity: 1 }
		]);
	});

	it('drops printingId — no merged entry can honestly carry one', () => {
		const card = makeCard({ slug: 'chrome-fang', cardType: 'Unit' });
		const merged = combinedEntries(
			[{ card, quantity: 1, printingId: 'A' }],
			[{ card, quantity: 1, printingId: 'B' }]
		);
		expect(merged).toEqual([{ card, quantity: 2 }]);
	});

	it('leaves each pile alone — no mutation of the inputs', () => {
		const card = makeCard({ slug: 'chrome-fang', cardType: 'Unit' });
		const entries: DeckEntry[] = [{ card, quantity: 2 }];
		combinedEntries(entries, [{ card, quantity: 1 }]);
		expect(entries).toEqual([{ card, quantity: 2 }]);
	});
});

describe('copiesOf', () => {
	it('counts the main deck and the sideboard together — see the doc comment for why', () => {
		const card = makeCard({ slug: 'chrome-fang', cardType: 'Unit' });
		const other = makeCard({ slug: 'militech', cardType: 'Gear' });

		expect(copiesOf(card, [{ card, quantity: 2 }], [{ card, quantity: 1 }])).toBe(3);
		expect(copiesOf(card, [{ card: other, quantity: 3 }], [])).toBe(0);
		expect(copiesOf(card, [], [])).toBe(0);
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
		const v1 = legend('V', 'Streetkid');
		const v2 = legend('V', 'Corporate Exile');
		const goro = legend('Goro Takemura', 'Hands Unclean');

		expect(legendNameConflicts([v1, v2, goro])).toEqual([{ baseName: 'V', legends: [v1, v2] }]);
	});

	it('is empty when every chosen Legend has a distinct base name', () => {
		const legends = [
			legend('V', 'Streetkid'),
			legend('Goro Takemura', 'Hands Unclean'),
			legend('Rebecca', 'Having a Moment')
		];
		expect(legendNameConflicts(legends)).toEqual([]);
	});

	it('is empty for zero or one Legend', () => {
		expect(legendNameConflicts([])).toEqual([]);
		expect(legendNameConflicts([legend('V', 'Streetkid')])).toEqual([]);
	});
});

describe('notLegalCards', () => {
	it('collects legends and main-deck cards the source API marks not-legal', () => {
		const stubLegend = makeCard({ cardType: 'Legend', tournamentLegal: false });
		const legalLegend = makeCard({ cardType: 'Legend' });
		const stubEntry: DeckEntry = {
			card: makeCard({ cardType: 'Unit', tournamentLegal: false }),
			quantity: 1
		};
		const legalEntry: DeckEntry = { card: makeCard({ cardType: 'Unit' }), quantity: 1 };

		expect(notLegalCards([stubLegend, legalLegend], [stubEntry, legalEntry])).toEqual([
			stubLegend,
			stubEntry.card
		]);
	});

	it('is empty when every legend and entry is tournament legal', () => {
		expect(notLegalCards([makeCard({ cardType: 'Legend' })], [])).toEqual([]);
	});
});

describe('deckIssues', () => {
	const legal = {
		totalCards: MIN_DECK_SIZE,
		sizeStatus: 'legal' as const,
		sideboardCards: SIDEBOARD_SIZE,
		sideboardStatus: 'legal' as const,
		sideboardLegends: [],
		violations: [],
		nameConflicts: [],
		notLegal: []
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

	it('says nothing about an empty sideboard — a legal deck without one', () => {
		expect(deckIssues({ ...legal, sideboardCards: 0, sideboardStatus: 'empty' })).toEqual([]);
	});

	it('reports a part-built sideboard with its count and the required size', () => {
		const issues = deckIssues({ ...legal, sideboardCards: 4, sideboardStatus: 'incomplete' });
		expect(issues).toEqual([
			{
				kind: 'sideboard',
				message: `Sideboard has 4 cards — a constructed sideboard is exactly ${SIDEBOARD_SIZE}.`
			}
		]);
	});

	it('reports an oversized sideboard — only reachable via a hand-edited payload', () => {
		const issues = deckIssues({ ...legal, sideboardCards: 8, sideboardStatus: 'over' });
		expect(issues).toEqual([
			{ kind: 'sideboard', message: `Sideboard has 8 cards — the maximum is ${SIDEBOARD_SIZE}.` }
		]);
	});

	it('reports Legends found in the sideboard by name', () => {
		const smasher = makeCard({ name: 'Adam Smasher: Full Chrome', cardType: 'Legend' });
		const issues = deckIssues({ ...legal, sideboardLegends: [smasher] });
		expect(issues).toEqual([
			{
				kind: 'sideboard',
				message: "Legends can't go in the sideboard: Adam Smasher: Full Chrome."
			}
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
		const v1 = legend('V', 'Streetkid');
		const v2 = legend('V', 'Corporate Exile');
		const issues = deckIssues({
			...legal,
			nameConflicts: legendNameConflicts([v1, v2])
		});
		expect(issues).toEqual([
			{
				kind: 'legend-names',
				message: 'Legends can\'t share a name: V: Streetkid and V: Corporate Exile are both "V".'
			}
		]);
	});

	it('reports not-legal legends and cards by name', () => {
		const stub = makeCard({ name: 'Rebecca: Having a Moment', tournamentLegal: false });
		const issues = deckIssues({ ...legal, notLegal: [stub] });
		expect(issues).toEqual([
			{ kind: 'not-legal', message: "1 card isn't tournament legal: Rebecca: Having a Moment." }
		]);
	});

	it('combines every kind of issue at once', () => {
		const overBudget: DeckEntry = {
			card: makeCard({ name: 'Cyberdeck', cardType: 'Unit', ramRequired: 4 }),
			quantity: 1
		};
		const v1 = legend('V', 'Streetkid');
		const v2 = legend('V', 'Corporate Exile');
		const stub = makeCard({ name: 'Rebecca: Having a Moment', tournamentLegal: false });
		const issues = deckIssues({
			totalCards: 39,
			sizeStatus: 'under',
			sideboardCards: 4,
			sideboardStatus: 'incomplete',
			sideboardLegends: [],
			violations: [overBudget],
			nameConflicts: legendNameConflicts([v1, v2]),
			notLegal: [stub]
		});
		expect(issues.map((issue) => issue.kind)).toEqual([
			'size',
			'sideboard',
			'ram',
			'legend-names',
			'not-legal'
		]);
	});
});
