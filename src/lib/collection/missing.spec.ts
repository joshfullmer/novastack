/**
 * Missing (`missing.ts`) — over hand-built decks and collections small enough to check by hand.
 *
 * The three properties of the definition worth pinning down are the Card-level rollup, the
 * per-Deck independence, and the indifference to the Collecting Goal. Each gets a test, because
 * each is a decision somebody could reasonably undo by accident.
 */
import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '#lib/cards/fixtures.js';
import { missingForDeck, ownedOfCard, wantedPrintingId } from './missing.ts';

/** One Card with three Printings — retail, beta, French — and one with a single Printing. */
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

describe('ownedOfCard', () => {
	it('sums every printing of the card', () => {
		expect(ownedOfCard(adam, owning({ 'adam-retail': 1, 'adam-beta': 2 }))).toBe(3);
	});

	it('is zero when none are held', () => {
		expect(ownedOfCard(adam, owning({}))).toBe(0);
	});
});

describe('missingForDeck', () => {
	it('reports nothing for a deck the collection covers', () => {
		const report = missingForDeck([{ card: adam, quantity: 2 }], owning({ 'adam-retail': 2 }));

		expect(report).toMatchObject({ cardCount: 0, copyCount: 0, complete: true });
		expect(report.cards).toEqual([]);
	});

	it('counts the shortfall, not the whole requirement', () => {
		const report = missingForDeck([{ card: adam, quantity: 3 }], owning({ 'adam-retail': 1 }));

		expect(report.cards).toHaveLength(1);
		expect(report.cards[0]).toMatchObject({ needed: 3, owned: 1, missing: 2 });
		expect(report).toMatchObject({ cardCount: 1, copyCount: 2, complete: false });
	});

	// The Card-level rollup: a beta copy satisfies a deck that asked for retail, because a
	// Printing is cosmetic and any copy can be played.
	it('accepts any printing of the card', () => {
		const report = missingForDeck(
			[{ card: adam, quantity: 3 }],
			owning({ 'adam-beta': 2, 'adam-fr': 1 })
		);

		expect(report.complete).toBe(true);
	});

	// A deck may name one card twice — two printings of it — and three copies is three copies.
	it('sums entries naming the same card', () => {
		const report = missingForDeck(
			[
				{ card: adam, quantity: 2 },
				{ card: adam, quantity: 1 }
			],
			owning({ 'adam-retail': 1 })
		);

		expect(report.cards).toHaveLength(1);
		expect(report.cards[0]).toMatchObject({ needed: 3, missing: 2 });
	});

	it('adds up across cards', () => {
		const report = missingForDeck(
			[
				{ card: adam, quantity: 3 },
				{ card: royce, quantity: 2 }
			],
			owning({ 'adam-retail': 1 })
		);

		expect(report).toMatchObject({ cardCount: 2, copyCount: 4, complete: false });
	});

	// Per-Deck independence: the same collection answers two decks the same way, because nothing
	// is allocated between them.
	it('answers two decks independently', () => {
		const held = owning({ 'adam-retail': 3 });
		const deck = [{ card: adam, quantity: 3 }];

		expect(missingForDeck(deck, held).complete).toBe(true);
		expect(missingForDeck(deck, held).complete).toBe(true);
	});

	// Nothing here takes a Goal, and that's the point: an Off Goal printing you own still builds
	// the deck. This test exists so a future "helpful" Goal filter has to delete it deliberately.
	it('counts copies the collecting goal excludes', () => {
		const report = missingForDeck([{ card: adam, quantity: 1 }], owning({ 'adam-fr': 1 }));

		expect(report.complete).toBe(true);
	});

	it('never reports negative shortfall for a card held in excess', () => {
		const report = missingForDeck([{ card: adam, quantity: 1 }], owning({ 'adam-retail': 9 }));

		expect(report.copyCount).toBe(0);
	});
});

describe('wantedPrintingId', () => {
	it("uses the deck's own printing when it named one", () => {
		expect(wantedPrintingId(adam, 'adam-beta')).toBe('adam-beta');
	});

	it('falls back to the default printing', () => {
		expect(wantedPrintingId(adam)).toBe('adam-retail');
	});

	// A stale printing id — from a re-ingest, say — must not end up on a Wantlist as-is.
	it('ignores a printing that is not this card’s', () => {
		expect(wantedPrintingId(adam, 'royce-retail')).toBe('adam-retail');
	});
});
