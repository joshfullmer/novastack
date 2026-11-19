/**
 * The decks queries, run for real over the shared world (`test-world.ts`; read its header for who did
 * what). Finish order is rank as a fraction of the field: D1 1/4, D5 1/3, D2 2/4, D6 2/3, D3 3/4, D4 4/4.
 */
import { describe, expect, it } from 'vitest';
import {
	DECKS_PER_PAGE,
	buildShelf,
	SHELF_DECKS,
	SHELF_LINES,
	type DeckFilters
} from '#lib/tournaments/deck-views.js';
import type { LineRow } from '#lib/tournaments/meta.js';
import { ALL_TIME, type Period, ANY_EVENTS } from '#lib/tournaments/period.js';
import { getDeckDetail, getDeckList, getDecksByLine } from './tournament-decks.js';
import { seedCorpus } from './test-corpus.js';
import { createTestDb } from './test-db.js';
import { seedEvent } from './test-seed.js';
import { world as buildWorld } from './test-world.js';

const world = () => buildWorld().db;
const none: DeckFilters = {
	legend: null,
	line: null,
	ram: null,
	cards: [],
	player: null,
	sort: 'finish',
	page: 1
};
const guids = async (filters: Partial<DeckFilters>, period: Period = ALL_TIME) =>
	(await getDeckList(world(), period, { ...none, ...filters })).rows.map((r) => r.guid);

describe('getDeckList', () => {
	it('sorts by finish as a share of the field, best first', async () => {
		expect(await guids({})).toEqual(['D1', 'D5', 'D2', 'D6', 'D3', 'D4']);
	});

	it('sorts by recency, then by finish within an event', async () => {
		expect(await guids({ sort: 'recent' })).toEqual(['D5', 'D6', 'D1', 'D2', 'D3', 'D4']);
	});

	it('reports totals and the deck player, event and record', async () => {
		const page = await getDeckList(world(), ALL_TIME, none);
		expect(page).toMatchObject({ total: 6, page: 1, pages: 1 });
		expect(page.rows[0]).toMatchObject({
			guid: 'D1',
			player: 'P1',
			eventName: 'Event 1',
			rank: 1,
			playerCount: 4,
			wins: 3,
			losses: 0,
			legends: ['a', 'b', 'c']
		});
	});

	it('filters by a Legend the deck runs', async () => {
		expect((await guids({ legend: 'e' })).sort()).toEqual(['D4']);
		expect((await guids({ legend: 'c' })).sort()).toEqual(['D1', 'D2', 'D6']);
		expect((await guids({ legend: 'a' })).sort()).toEqual(['D1', 'D2', 'D3', 'D5', 'D6']);
	});

	it('filters by the RAM the Legends provide, so YYR and RRY are different decks', async () => {
		expect((await guids({ ram: 'rryyyy' })).sort()).toEqual(['D1', 'D2', 'D6']); // X
		expect((await guids({ ram: 'rrrryy' })).sort()).toEqual(['D3', 'D5']); // Y: same colours, other RAM
		expect(await guids({ ram: 'bbbb' })).toEqual([]);
	});

	it('filters by a whole Legend line, not just a Legend in it', async () => {
		expect((await guids({ line: 'a+b+c' })).sort()).toEqual(['D1', 'D2', 'D6']);
		expect((await guids({ line: 'a+b+d' })).sort()).toEqual(['D3', 'D5']);
		// Legend `a` is in five decks; the line a+b is none, and a line is exact.
		expect(await guids({ line: 'a+b' })).toEqual([]);
		expect((await guids({ line: 'a+b+c', legend: 'a' })).length).toBe(3);
		expect(await guids({ line: 'a+b+c', legend: 'd' })).toEqual([]);
	});

	it('filters by a card, main deck or sideboard, any of several', async () => {
		expect((await guids({ cards: ['m3'] })).sort()).toEqual(['D4', 'D5']);
		expect(await guids({ cards: ['s1'] })).toEqual(['D1']); // sideboard only
		expect((await guids({ cards: ['m3', 's1'] })).sort()).toEqual(['D1', 'D4', 'D5']);
	});

	it('does not treat a Legend as a card the deck "runs"', async () => {
		expect(await guids({ cards: ['a'] })).toEqual([]);
	});

	it('filters by a fragment of the player name, ignoring case', async () => {
		expect(await guids({ player: 'p1' })).toEqual(['D1']);
		expect((await guids({ player: 'P' })).length).toBe(6); // P7 has no deck
	});

	it('treats % and _ in a name filter as text, not wildcards', async () => {
		expect(await guids({ player: '%' })).toEqual([]);
		expect(await guids({ player: 'P_' })).toEqual([]);
	});

	it('combines filters', async () => {
		expect((await guids({ legend: 'a', cards: ['m2'] })).sort()).toEqual(['D1', 'D3', 'D6']);
		expect(await guids({ legend: 'e', cards: ['m1'] })).toEqual([]);
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
		expect(await guids({}, nov16)).toEqual(['D5', 'D6']);
	});

	it('pages, clamping an out-of-range page rather than erroring', async () => {
		const { db, sqlite } = createTestDb();
		const total = DECKS_PER_PAGE * 2 + 5;
		seedEvent(sqlite, {
			id: 9,
			name: 'Big',
			startsAt: '2026-11-15T00:00:00Z',
			players: Array.from({ length: total }, (_, i) => ({
				id: 100 + i,
				name: `Player ${i}`,
				rank: i + 1,
				wins: 1,
				losses: 0,
				deck: { guid: `G${i}`, legends: ['a', 'b', 'c'] }
			}))
		});
		const list = (page: number) => getDeckList(db, ALL_TIME, { ...none, page });
		const [one, two, three] = [await list(1), await list(2), await list(3)];
		expect([one.rows.length, two.rows.length, three.rows.length]).toEqual([
			DECKS_PER_PAGE,
			DECKS_PER_PAGE,
			5
		]);
		expect(one.pages).toBe(3);
		expect(one.rows[0].rank).toBe(1);
		expect(two.rows[0].rank).toBe(DECKS_PER_PAGE + 1);
		expect((await list(99)).page).toBe(3);
		expect((await list(0)).page).toBe(1);
		expect((await list(-5)).rows.length).toBe(DECKS_PER_PAGE);
	});

	it('is an empty single page, not an error, when nothing matches', async () => {
		const page = await getDeckList(world(), ALL_TIME, { ...none, player: 'nobody' });
		expect(page).toMatchObject({ total: 0, page: 1, pages: 1, rows: [] });
	});
});

describe('getDeckDetail', () => {
	it('returns the deck, its lists, and who played it where', async () => {
		const deck = await getDeckDetail(world(), 'D1');
		expect(deck).toMatchObject({
			guid: 'D1',
			player: 'P1',
			eventName: 'Event 1',
			rank: 1,
			line: 'a+b+c',
			legends: ['a', 'b', 'c'],
			main: [
				{ slug: 'm1', quantity: 3 },
				{ slug: 'm2', quantity: 2 }
			],
			side: [{ slug: 's1', quantity: 1 }]
		});
	});

	it('works out the path through the event, with each opponent’s Legends', async () => {
		const deck = await getDeckDetail(world(), 'D1');
		expect(deck?.path).toEqual([
			{
				round: 1,
				opponent: 'P3',
				oppLegends: ['a', 'b', 'd'],
				oppDeck: 'D3',
				result: 'W',
				score: '2–0'
			},
			{
				round: 2,
				opponent: 'P2',
				oppLegends: ['a', 'b', 'c'],
				oppDeck: 'D2',
				result: 'W',
				score: '2–0'
			},
			{
				round: 3,
				opponent: 'P4',
				oppLegends: ['e', 'f', 'g'],
				oppDeck: 'D4',
				result: 'W',
				score: '2–0'
			}
		]);
	});

	it('reads a loss from the deck’s own side, whichever side it was drawn on', async () => {
		const deck = await getDeckDetail(world(), 'D6'); // P6 was player B against P5, then A against P7
		expect(deck?.path).toEqual([
			{
				round: 1,
				opponent: 'P5',
				oppLegends: ['a', 'b', 'd'],
				oppDeck: 'D5',
				result: 'L',
				score: '1–2'
			},
			// P7 has no deck, so there is nothing to open
			{ round: 2, opponent: 'P7', oppLegends: [], oppDeck: null, result: 'W', score: '2–0' }
		]);
	});

	it('shows a bye as a bye', async () => {
		const deck = await getDeckDetail(world(), 'D5');
		expect(deck?.path.at(-1)).toEqual({
			round: 2,
			opponent: null,
			oppLegends: [],
			oppDeck: null,
			result: 'BYE',
			score: ''
		});
	});

	it('is null for a deck we do not have', async () => {
		expect(await getDeckDetail(world(), 'nope')).toBeNull();
	});
});

describe('getDecksByLine', () => {
	it('groups decks by Legend line, biggest shelf first', async () => {
		const { shelves, lines, decks } = await getDecksByLine(world(), ALL_TIME);
		expect(shelves.map((s) => [s.line, s.deckCount, s.decks.length])).toEqual([
			['a+b+c', 3, 3],
			['a+b+d', 2, 2],
			['e+f+g', 1, 1]
		]);
		expect([lines, decks]).toEqual([3, 6]);
		expect(shelves[0].legends).toEqual(['a', 'b', 'c']);
		expect(shelves[0].bestRank).toBe(1);
	});

	it('quotes no win rate for a shelf under five decks', async () => {
		const { shelves } = await getDecksByLine(world(), ALL_TIME);
		expect(shelves.every((s) => s.winRate === null)).toBe(true);
	});
});

describe('getDecksByLine on a large field', () => {
	it('draws a fixed number of lines and decks, with the record over all of them', async () => {
		const { db, sqlite } = createTestDb();
		seedCorpus(sqlite, { events: 60 });
		const { shelves, lines, decks } = await getDecksByLine(db, ALL_TIME);

		expect(shelves).toHaveLength(SHELF_LINES);
		expect(lines).toBeGreaterThan(SHELF_LINES);
		const popular = shelves[0];
		expect(popular.decks).toHaveLength(SHELF_DECKS);
		expect(popular.deckCount).toBeGreaterThan(SHELF_DECKS);
		// The sample is the line's best finishes, so its best deck is the best the line ever had.
		expect(Math.min(...popular.decks.map((d) => d.rank))).toBe(popular.bestRank);
		expect(decks).toBeGreaterThan(popular.deckCount);
		expect(shelves.map((s) => s.deckCount)).toEqual(
			[...shelves.map((s) => s.deckCount)].sort((a, b) => b - a)
		);
	});
});

describe('buildShelf', () => {
	const line = (decks: number): LineRow & { line: string } => ({
		line: 'a+b+c',
		decks,
		matchWins: 12,
		matchLosses: 8,
		matchDraws: 0,
		top8: 0,
		wins: 0,
		best: 3
	});

	it('quotes a win rate from five decks up, over every deck of the line', () => {
		expect(buildShelf(line(5), []).winRate).toBeCloseTo(12 / 20);
		expect(buildShelf(line(4), []).winRate).toBeNull();
	});

	it('reports the line, not the sample, for its size and best finish', () => {
		expect(buildShelf(line(40), [])).toMatchObject({ deckCount: 40, bestRank: 3, decks: [] });
	});
});
