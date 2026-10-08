/**
 * The Collection tab's arithmetic (`deck-collection.ts`) — over decks and collections small enough
 * to check by hand.
 *
 * The properties worth pinning down are the ones a later change could plausibly break without
 * anyone noticing: every card appears (not just the short ones), a `−` finds copies wherever they
 * are, and "add all" tops up rather than piles on — which is what makes pressing it twice safe.
 */
import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '#lib/cards/fixtures.js';
import {
	deckCollectionRows,
	deckCollectionSummary,
	removeTarget,
	topUpPlan,
	wantlistPlan
} from './deck-collection.ts';

const adam = makeCard({
	slug: 'adam-smasher',
	printings: [
		makePrinting({ id: 'adam-retail', setId: 'MS01-WNC', collectorNumber: '001' }),
		makePrinting({ id: 'adam-beta', setId: 'MS01-WNC', collectorNumber: 'β001' }),
		makePrinting({ id: 'adam-fr', setId: 'MS01-WNC', collectorNumber: '001', locale: 'fr' })
	]
});

const royce = makeCard({
	slug: 'royce',
	printings: [makePrinting({ id: 'royce-retail', setId: 'MS01-WNC', collectorNumber: '002' })]
});

const owning = (counts: Record<string, number>) => (printingId: string) => counts[printingId] ?? 0;

describe('deckCollectionRows', () => {
	it('lists every card, including ones already owned in full', () => {
		const rows = deckCollectionRows(
			[
				{ card: adam, quantity: 2 },
				{ card: royce, quantity: 1 }
			],
			owning({ 'adam-retail': 2 })
		);

		expect(rows.map((row) => row.card.slug)).toEqual(['adam-smasher', 'royce']);
		expect(rows[0]).toMatchObject({ needed: 2, owned: 2, missing: 0 });
		expect(rows[1]).toMatchObject({ needed: 1, owned: 0, missing: 1 });
	});

	it('sums entries naming the same card', () => {
		const rows = deckCollectionRows(
			[
				{ card: adam, quantity: 1 },
				{ card: adam, quantity: 2 }
			],
			owning({})
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].needed).toBe(3);
	});

	it('counts ownership across printings, and says how many hold copies', () => {
		const [row] = deckCollectionRows(
			[{ card: adam, quantity: 3 }],
			owning({ 'adam-beta': 1, 'adam-fr': 1 })
		);

		expect(row.owned).toBe(2);
		expect(row.missing).toBe(1);
		expect(row.printingsHeld).toBe(2);
	});

	it('targets the default printing for additions', () => {
		const [row] = deckCollectionRows([{ card: adam, quantity: 1 }], owning({}));
		expect(row.addTarget).toBe('adam-retail');
	});
});

describe('removeTarget', () => {
	it('takes from the add target when it holds a copy, so +/− are symmetrical', () => {
		const [row] = deckCollectionRows(
			[{ card: adam, quantity: 3 }],
			owning({ 'adam-retail': 1, 'adam-beta': 2 })
		);
		expect(removeTarget(row, owning({ 'adam-retail': 1, 'adam-beta': 2 }))).toBe('adam-retail');
	});

	it('falls back to the printing holding the most, rather than doing nothing', () => {
		const owned = owning({ 'adam-beta': 1, 'adam-fr': 3 });
		const [row] = deckCollectionRows([{ card: adam, quantity: 3 }], owned);
		expect(row.owned).toBe(4);
		expect(removeTarget(row, owned)).toBe('adam-fr');
	});

	it('is null only when nothing is held anywhere', () => {
		const [row] = deckCollectionRows([{ card: adam, quantity: 1 }], owning({}));
		expect(removeTarget(row, owning({}))).toBeNull();
	});
});

describe('topUpPlan', () => {
	it('adds only the shortfall, onto what the target already holds', () => {
		const owned = owning({ 'adam-retail': 1 });
		const rows = deckCollectionRows(
			[
				{ card: adam, quantity: 3 },
				{ card: royce, quantity: 2 }
			],
			owned
		);

		expect([...topUpPlan(rows, owned)]).toEqual([
			['adam-retail', 3],
			['royce-retail', 2]
		]);
	});

	it('leaves a card you hold more of than the deck asks for alone', () => {
		const owned = owning({ 'adam-retail': 4 });
		const rows = deckCollectionRows([{ card: adam, quantity: 2 }], owned);
		expect(topUpPlan(rows, owned).size).toBe(0);
	});

	it('is idempotent — the second press has nothing to do', () => {
		const counts: Record<string, number> = { 'adam-retail': 1 };
		const owned = owning(counts);

		const plan = topUpPlan(deckCollectionRows([{ card: adam, quantity: 3 }], owned), owned);
		expect(plan.get('adam-retail')).toBe(3);

		// Apply it, exactly as the store would, then re-plan.
		for (const [printingId, quantity] of plan) counts[printingId] = quantity;
		const second = topUpPlan(deckCollectionRows([{ card: adam, quantity: 3 }], owned), owned);
		expect(second.size).toBe(0);
	});

	it('counts copies held on other printings toward the top-up', () => {
		// Two beta copies satisfy two of the three the deck wants, so only one retail is added.
		const owned = owning({ 'adam-beta': 2 });
		const rows = deckCollectionRows([{ card: adam, quantity: 3 }], owned);
		expect([...topUpPlan(rows, owned)]).toEqual([['adam-retail', 1]]);
	});
});

describe('deckCollectionSummary', () => {
	it('splits complete from short, and totals the copies short', () => {
		const owned = owning({ 'adam-retail': 2 });
		const rows = deckCollectionRows(
			[
				{ card: adam, quantity: 2 },
				{ card: royce, quantity: 3 }
			],
			owned
		);

		expect(deckCollectionSummary(rows)).toEqual({
			cards: 2,
			cardsComplete: 1,
			cardsShort: 1,
			copiesShort: 3,
			printingShortfallCards: 0,
			complete: false
		});
	});

	it('is complete for a deck the collection covers', () => {
		const owned = owning({ 'adam-retail': 2 });
		const rows = deckCollectionRows([{ card: adam, quantity: 2 }], owned);
		expect(deckCollectionSummary(rows).complete).toBe(true);
	});
});

describe('rows scoped to a chosen printing', () => {
	it('counts only the chosen printing, and says where the rest are', () => {
		const owned = owning({ 'adam-retail': 3 });
		const [row] = deckCollectionRows([{ card: adam, quantity: 3, printingId: 'adam-fr' }], owned);

		expect(row.scope).toBe('printing');
		expect(row.owned).toBe(0);
		expect(row.missing).toBe(3);
		expect(row.ownedElsewhere).toBe(3);
		// Playability is untouched: three English copies field the deck fine.
		expect(row.playableOwned).toBe(3);
		expect(row.playableMissing).toBe(0);
	});

	it('stays Card level when the deck named no printing', () => {
		const owned = owning({ 'adam-retail': 1, 'adam-beta': 1 });
		const [row] = deckCollectionRows([{ card: adam, quantity: 3 }], owned);

		expect(row.scope).toBe('card');
		expect(row.owned).toBe(2);
		expect(row.ownedElsewhere).toBe(0);
	});

	it('stays Card level for a printing that has left the dataset', () => {
		// A deck following a stale id is not making a statement about art — it renders the default.
		const [row] = deckCollectionRows(
			[{ card: adam, quantity: 1, printingId: 'adam-from-a-deleted-set' }],
			owning({ 'adam-retail': 1 })
		);
		expect(row.scope).toBe('card');
		expect(row.owned).toBe(1);
	});

	it('treats a deck that named the default printing as a choice about art', () => {
		const owned = owning({ 'adam-beta': 2 });
		const [row] = deckCollectionRows(
			[{ card: adam, quantity: 2, printingId: 'adam-retail' }],
			owned
		);
		expect(row.scope).toBe('printing');
		expect(row.owned).toBe(0);
		expect(row.ownedElsewhere).toBe(2);
	});

	it('tops up the chosen printing, not the cheapest way to make the deck playable', () => {
		const owned = owning({ 'adam-retail': 3 });
		const rows = deckCollectionRows([{ card: adam, quantity: 3, printingId: 'adam-fr' }], owned);
		expect([...topUpPlan(rows, owned)]).toEqual([['adam-fr', 3]]);
	});

	it('never decrements a printing the row is not showing', () => {
		// `−` on a scoped row holding none must do nothing, rather than quietly taking an English
		// copy off a row that reads 0/3 in French.
		const owned = owning({ 'adam-retail': 2 });
		const [row] = deckCollectionRows([{ card: adam, quantity: 3, printingId: 'adam-fr' }], owned);
		expect(removeTarget(row, owned)).toBeNull();
	});

	it('takes the first printing named when a deck lists a card twice', () => {
		const owned = owning({});
		const [row] = deckCollectionRows(
			[
				{ card: adam, quantity: 1, printingId: 'adam-beta' },
				{ card: adam, quantity: 2 }
			],
			owned
		);
		expect(row.needed).toBe(3);
		expect(row.addTarget).toBe('adam-beta');
	});
});

describe('the headline stays about playability', () => {
	it('reports no shortfall for a deck owned in the wrong art, but flags the printings', () => {
		const owned = owning({ 'adam-retail': 3, 'royce-retail': 1 });
		const rows = deckCollectionRows(
			[
				{ card: adam, quantity: 3, printingId: 'adam-fr' },
				{ card: royce, quantity: 1 }
			],
			owned
		);

		const summary = deckCollectionSummary(rows);
		expect(summary.complete).toBe(true);
		expect(summary.copiesShort).toBe(0);
		expect(summary.printingShortfallCards).toBe(1);
	});

	it('counts Card-level copies short, ignoring which printing they would be', () => {
		const owned = owning({ 'adam-beta': 1 });
		const rows = deckCollectionRows([{ card: adam, quantity: 3, printingId: 'adam-fr' }], owned);

		const summary = deckCollectionSummary(rows);
		// Two copies short to play; three short of the French art, which is the row's business.
		expect(summary.copiesShort).toBe(2);
		expect(rows[0].missing).toBe(3);
		expect(summary.printingShortfallCards).toBe(0);
	});
});

describe('wantlistPlan', () => {
	const rows = deckCollectionRows(
		[
			{ card: adam, quantity: 2 },
			{ card: royce, quantity: 1 }
		],
		owning({})
	);

	it('asks for the cheapest printing, not the default, when the deck made no choice', () => {
		const plan = wantlistPlan(rows, (card) =>
			card.slug === 'adam-smasher' ? 'adam-beta' : undefined
		);
		expect(plan).toContainEqual({ printingId: 'adam-beta', quantity: 2 });
	});

	it('falls back to the default printing when nothing is priced', () => {
		const plan = wantlistPlan(rows, () => undefined);
		expect(plan).toEqual([
			{ printingId: 'adam-retail', quantity: 2 },
			{ printingId: 'royce-retail', quantity: 1 }
		]);
	});

	it("keeps the deck's own chosen printing, however cheap another is", () => {
		const scoped = deckCollectionRows(
			[{ card: adam, quantity: 2, printingId: 'adam-fr' }],
			owning({})
		);
		expect(wantlistPlan(scoped, () => 'adam-beta')).toEqual([
			{ printingId: 'adam-fr', quantity: 2 }
		]);
	});

	it('asks only for what is missing, in the row’s own scope', () => {
		const partial = deckCollectionRows([{ card: adam, quantity: 3 }], owning({ 'adam-retail': 1 }));
		expect(wantlistPlan(partial, () => 'adam-beta')).toEqual([
			{ printingId: 'adam-beta', quantity: 2 }
		]);

		const owned = deckCollectionRows([{ card: royce, quantity: 1 }], owning({ 'royce-retail': 1 }));
		expect(wantlistPlan(owned, () => 'royce-retail')).toEqual([]);
	});
});
