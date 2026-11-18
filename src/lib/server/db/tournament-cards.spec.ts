/**
 * Card statistics and one Card's usage, run for real over a hand-countable world (see
 * `tournament-stats.spec.ts` for the people and results). Cards: m1, m2, m3 in main decks, s1 in a
 * sideboard.
 *
 *   deck  line  rank   main                 side
 *   D1    X     1      m1×3 m2×2            s1×1
 *   D2    X     2      m1×3
 *   D3    Y     3      m1×2 m2×3            m2×1
 *   D4    Z     4      m3×3
 *   D5    Y     1 (ev2) m1×3 m3×1
 *   D6    X     2 (ev2) m2×2               m1×1
 */
import { describe, expect, it } from 'vitest';
import { ALL_TIME, type Period, ANY_EVENTS } from '#lib/tournaments/period.js';
import { getCardStats, getCardUsage } from './tournament-stats.js';
import { world as buildWorld } from './test-world.js';

const world = () => buildWorld().db;

describe('getCardStats', () => {
	it('counts main-deck inclusion, average copies and sideboard use per card', async () => {
		const { decks, cards } = await getCardStats(world(), ALL_TIME);
		expect(decks).toBe(6);
		const by = new Map(cards.map((c) => [c.slug, c]));
		// m1 is in four main decks (3+3+2+3 = 11 copies) and one sideboard (D6)
		expect(by.get('m1')).toMatchObject({ decks: 4, sideDecks: 1 });
		expect(by.get('m1')?.inclusion).toBeCloseTo(4 / 6);
		expect(by.get('m1')?.avgCopies).toBeCloseTo(11 / 4);
		// m2: D1 (2), D3 (3), D6 (2) = 3 decks / 7 copies; also in D3's sideboard
		expect(by.get('m2')).toMatchObject({ decks: 3, sideDecks: 1 });
		expect(by.get('m2')?.avgCopies).toBeCloseTo(7 / 3);
		// m3: D4 (3) and D5 (1)
		expect(by.get('m3')).toMatchObject({ decks: 2, sideDecks: 0 });
	});

	it('keeps a sideboard-only card, with no inclusion and no copies', async () => {
		const { cards } = await getCardStats(world(), ALL_TIME);
		expect(cards.find((c) => c.slug === 's1')).toMatchObject({
			decks: 0,
			inclusion: 0,
			avgCopies: 0,
			sideDecks: 1
		});
	});

	it('does not count a Legend as a card in the deck', async () => {
		const { cards } = await getCardStats(world(), ALL_TIME);
		expect(cards.map((c) => c.slug)).not.toContain('a');
	});

	it('orders by inclusion, most first', async () => {
		const { cards } = await getCardStats(world(), ALL_TIME);
		expect(cards.map((c) => c.slug)).toEqual(['m1', 'm2', 'm3', 's1']);
	});

	it('narrows to one Legend line, using that line’s decks as the denominator', async () => {
		const { decks, cards } = await getCardStats(world(), ALL_TIME, { line: 'a+b+c', ram: null }); // D1 D2 D6
		expect(decks).toBe(3);
		const by = new Map(cards.map((c) => [c.slug, c]));
		expect(by.get('m1')).toMatchObject({ decks: 2, sideDecks: 1 }); // D1 D2 main; D6 side
		expect(by.get('m1')?.inclusion).toBeCloseTo(2 / 3);
		expect(by.get('m2')).toMatchObject({ decks: 2 }); // D1 D6
		expect(by.has('m3')).toBe(false); // no X deck ran it
	});

	it('cuts by period', async () => {
		const nov16: Period = {
			id: 1,
			name: 'n',
			from: Date.parse('2026-11-16T00:00:00Z'),
			to: null,
			param: null,
			...ANY_EVENTS
		};
		const { decks, cards } = await getCardStats(world(), nov16); // D5 D6
		expect(decks).toBe(2);
		expect(cards.find((c) => c.slug === 'm1')).toMatchObject({ decks: 1, sideDecks: 1 });
	});
});

describe('getCardStats, by RAM', () => {
	it('narrows to the decks whose Legends provide that RAM', async () => {
		const { decks, cards } = await getCardStats(world(), ALL_TIME, { line: null, ram: 'rrrryy' });
		expect(decks).toBe(2); // D3 D5
		expect(cards.find((c) => c.slug === 'm1')).toMatchObject({ decks: 2, inclusion: 1 });
	});
});

describe('getCardUsage', () => {
	it('says which RAMs run the card, with how many of each RAM’s decks do', async () => {
		const usage = await getCardUsage(world(), ALL_TIME, 'm3');
		// m3: D4 (bbbbgg, its only deck) and D5 (rrrryy, of 2).
		expect(usage.byRam).toEqual([
			{ ram: 'bbbbgg', decks: 1, withCard: 1, rate: 1 },
			{ ram: 'rrrryy', decks: 2, withCard: 1, rate: 0.5 }
		]);
		expect(usage.ramCount).toBe(2);
	});

	it('counts every deck that ran the card anywhere', async () => {
		const usage = await getCardUsage(world(), ALL_TIME, 'm1');
		// D1 D2 D3 D5 in the main deck, D6 in the sideboard
		expect(usage.decks).toBe(5);
		expect(usage.totalDecks).toBe(6);
		expect(usage.inclusion).toBeCloseTo(5 / 6);
	});

	it('works out copies, sideboard use, and finishes', async () => {
		const usage = await getCardUsage(world(), ALL_TIME, 'm1');
		expect(usage.avgCopies).toBeCloseTo(11 / 4); // averaged over the decks that run it in main
		expect(usage.inSide).toBe(1);
		expect(usage.winners).toBe(2); // D1 won event 1, D5 won event 2
		expect(usage.top8).toBe(5);
		expect(usage.allWinners).toBe(2);
		expect(usage.allTop8).toBe(6);
	});

	it('says which Legend lines run it, and how many of each line’s decks do', async () => {
		const usage = await getCardUsage(world(), ALL_TIME, 'm1');
		expect(usage.byLine.map((l) => [l.line, l.withCard, l.decks])).toEqual([
			['a+b+c', 3, 3], // D1 D2 D6, all of X
			['a+b+d', 2, 2] // D3 D5, all of Y
		]); // Z ran none, so it is absent
		expect(usage.byLine[0]).toMatchObject({ rate: 1, legends: ['a', 'b', 'c'] });
	});

	it('counts a card in both main and sideboard once', async () => {
		const usage = await getCardUsage(world(), ALL_TIME, 'm2');
		// D1 D3 D6 in the main deck (D3 also in its sideboard), D6's sideboard, D3 once: three decks, not four
		expect(usage.decks).toBe(3);
		expect(usage.inSide).toBe(1); // D3
	});

	it('also answers for a Legend, marking the decks that ran it as one', async () => {
		const usage = await getCardUsage(world(), ALL_TIME, 'a');
		expect(usage.decks).toBe(5); // every X and Y deck
		expect(usage.asLegend).toBe(5);
		expect(usage.avgCopies).toBe(0); // never in a main deck
	});

	it('is empty, not an error, for a card nobody ran', async () => {
		const usage = await getCardUsage(world(), ALL_TIME, 'nope');
		expect(usage).toMatchObject({ decks: 0, inclusion: 0, avgCopies: 0, byLine: [] });
		expect(usage.totalDecks).toBe(6);
	});

	it('cuts by period', async () => {
		const nov16: Period = {
			id: 1,
			name: 'n',
			from: Date.parse('2026-11-16T00:00:00Z'),
			to: null,
			param: null,
			...ANY_EVENTS
		};
		const usage = await getCardUsage(world(), nov16, 'm1');
		expect(usage.decks).toBe(2); // D5, D6
		expect(usage.totalDecks).toBe(2);
	});
});
