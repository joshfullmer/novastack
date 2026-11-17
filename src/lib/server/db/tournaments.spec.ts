/**
 * The event page's and list page's queries, run for real over the shared world (`test-world.ts`) plus
 * two awkward events: one whose champion registered no deck, and one with no decks at all.
 */
import { describe, expect, it } from 'vitest';
import { ANY_EVENT, EVENTS_PER_PAGE } from '#lib/tournaments/event-list.js';
import { getEventList, getEventView } from './tournaments.js';
import { seedEvent } from './test-seed.js';
import { world } from './test-world.js';

function withAwkwardEvents() {
	const { db, sqlite } = world();
	// The winner left their list empty: the next player with a deck should be shown instead.
	seedEvent(sqlite, {
		id: 3,
		name: 'Champion with no list',
		startsAt: '2026-11-17T12:00:00Z',
		players: [
			{ id: 8, name: 'P8', rank: 1, wins: 2, losses: 0 },
			{
				id: 9,
				name: 'P9',
				rank: 2,
				wins: 1,
				losses: 1,
				deck: { guid: 'D9', legends: ['h', 'i', 'j'] }
			},
			{
				id: 10,
				name: 'P10',
				rank: 3,
				wins: 0,
				losses: 2,
				deck: { guid: 'D10', legends: ['k', 'l', 'm'] }
			}
		]
	});
	// Nobody registered a deck.
	seedEvent(sqlite, {
		id: 4,
		name: 'No decks',
		startsAt: '2026-11-18T12:00:00Z',
		players: [{ id: 11, name: 'P11', rank: 1, wins: 1, losses: 0 }]
	});
	return db;
}

describe('getEventList', () => {
	it('lists events newest first with counts', async () => {
		const events = (await getEventList(withAwkwardEvents())).events;
		expect(events.map((e) => e.id)).toEqual([4, 3, 2, 1]);
		const [, , two, one] = events;
		expect(one).toMatchObject({ deckCount: 4, roundCount: 3, winner: 'P1', playerCount: 4 });
		expect(two).toMatchObject({ deckCount: 2, roundCount: 2, winner: 'P5', playerCount: 3 });
	});

	it("shows the winner's deck when there is one", async () => {
		const [, , , one] = (await getEventList(withAwkwardEvents())).events;
		expect(one.showcase).toEqual({ rank: 1, name: 'P1', legends: ['a', 'b', 'c'] });
	});

	it('shows the best-placed player who has a deck when the winner has none', async () => {
		const [, three] = (await getEventList(withAwkwardEvents())).events;
		expect(three.winner).toBe('P8');
		expect(three.showcase).toEqual({ rank: 2, name: 'P9', legends: ['h', 'i', 'j'] });
	});

	it('has no showcase, and still a winner, for an event with no decks', async () => {
		const [four] = (await getEventList(withAwkwardEvents())).events;
		expect(four).toMatchObject({ winner: 'P11', showcase: null, deckCount: 0, field: [] });
	});

	it('counts how many decks ran each Legend', async () => {
		const [, , , one] = (await getEventList(withAwkwardEvents())).events;
		// D1 D2 are X (a b c), D3 is Y (a b d), D4 is Z (e f g)
		expect(Object.fromEntries(one.field.map((f) => [f.slug, f.decks]))).toEqual({
			a: 3,
			b: 3,
			c: 2,
			d: 1,
			e: 1,
			f: 1,
			g: 1
		});
		expect(one.field[0].decks).toBeGreaterThanOrEqual(one.field[1].decks);
	});

	it('is empty when nothing has been ingested', async () => {
		const { createTestDb } = await import('./test-db.js');
		expect(await getEventList(createTestDb().db)).toEqual({
			events: [],
			total: 0,
			players: 0,
			page: 1,
			pages: 1,
			query: ANY_EVENT,
			kinds: [],
			years: []
		});
	});

	describe('filters', () => {
		const stocked = async () => {
			const { createTestDb } = await import('./test-db.js');
			const { db, sqlite } = createTestDb();
			const add = sqlite.prepare(
				`INSERT INTO tournaments (id, name, kind, starts_at, organizer_id, organizer_name, format, format_id, player_count)
				 VALUES (?, ?, ?, ?, 1, ?, 'Constructed', 'f', ?)`
			);
			const at = (iso: string) => Date.parse(iso);
			add.run(1, 'Night City Showdown', 'Showdown', at('2025-12-31T23:00:00Z'), 'Nexus', 10);
			add.run(2, 'Night City Showdown II', 'Showdown', at('2026-01-01T00:00:00Z'), 'Nexus', 20);
			add.run(3, 'Spring Regional', 'Regional', at('2026-03-01T00:00:00Z'), 'Arasaka Games', 100);
			add.run(4, '100% Cyberpunk Night', 'Other', at('2026-06-01T00:00:00Z'), 'Nexus', 8);
			return db;
		};
		const ids = async (query: Parameters<typeof getEventList>[1]) =>
			(await getEventList(await stocked(), query)).events.map((e) => e.id);

		it('filters by kind', async () => {
			expect(await ids({ kind: 'Showdown' })).toEqual([2, 1]);
			expect(await ids({ kind: 'Brawl' })).toEqual([]);
		});

		it('filters by calendar year, UTC, on its boundaries', async () => {
			expect(await ids({ year: 2026 })).toEqual([4, 3, 2]);
			expect(await ids({ year: 2025 })).toEqual([1]);
		});

		it('searches the event name and the organizer, with % and _ as plain text', async () => {
			expect(await ids({ q: 'regional' })).toEqual([3]);
			expect(await ids({ q: 'arasaka' })).toEqual([3]);
			expect(await ids({ q: '100%' })).toEqual([4]);
			expect(await ids({ q: '%' })).toEqual([4]);
		});

		it('combines filters, and totals are of what matches', async () => {
			const page = await getEventList(await stocked(), { kind: 'Showdown', year: 2026 });
			expect(page.events.map((e) => e.id)).toEqual([2]);
			expect([page.total, page.players]).toEqual([1, 20]);
		});

		it('counts each kind under the other filters, leaving out kinds with none', async () => {
			const all = await getEventList(await stocked());
			expect(all.kinds).toEqual([
				{ kind: 'Regional', count: 1 },
				{ kind: 'Showdown', count: 2 },
				{ kind: 'Other', count: 1 }
			]);
			// Choosing a year changes the counts but not the kind you are on, even at zero.
			const y = await getEventList(await stocked(), { year: 2025, kind: 'Regional' });
			expect(y.kinds).toEqual([
				{ kind: 'Regional', count: 0 },
				{ kind: 'Showdown', count: 1 }
			]);
		});

		it('lists every year the events span, newest first, whatever is filtered', async () => {
			expect((await getEventList(await stocked(), { kind: 'Regional' })).years).toEqual([
				2026, 2025
			]);
		});

		it('says so when nothing matches, rather than erroring', async () => {
			const page = await getEventList(await stocked(), { q: 'zzz', page: 5 });
			expect(page).toMatchObject({ events: [], total: 0, players: 0, page: 1, pages: 1 });
		});
	});

	describe('paging', () => {
		const corpus = async () => {
			const { createTestDb } = await import('./test-db.js');
			const { seedCorpus } = await import('./test-corpus.js');
			const { db, sqlite } = createTestDb();
			seedCorpus(sqlite, { events: EVENTS_PER_PAGE + 6 });
			return db;
		};

		it('returns one page of events with totals over all of them', async () => {
			const db = await corpus();
			const first = await getEventList(db, { page: 1 });
			const second = await getEventList(db, { page: 2 });
			expect(first.events).toHaveLength(EVENTS_PER_PAGE);
			expect(second.events).toHaveLength(6);
			expect([first.total, first.pages, second.page]).toEqual([EVENTS_PER_PAGE + 6, 2, 2]);
			expect(first.players).toBe(second.players);
			expect(first.players).toBeGreaterThan(0);
		});

		it('is newest first across pages, with no event twice', async () => {
			const db = await corpus();
			const all = [
				...(await getEventList(db, { page: 1 })).events,
				...(await getEventList(db, { page: 2 })).events
			];
			expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
			expect(all.map((e) => e.startsAt)).toEqual(
				[...all.map((e) => e.startsAt)].sort((a, b) => b - a)
			);
		});

		it('clamps a page past the end or before the start', async () => {
			const db = await corpus();
			expect((await getEventList(db, { page: 99 })).page).toBe(2);
			expect((await getEventList(db, { page: -3 })).page).toBe(1);
		});
	});
});

describe('getEventView', () => {
	it('assembles one event: standings, decks, rounds and matches', async () => {
		const event = await getEventView(world().db, 1);
		expect(event).toMatchObject({ id: 1, name: 'Event 1', playerCount: 4, deckCount: 4 });
		expect(event?.standings.map((s) => [s.rank, s.name])).toEqual([
			[1, 'P1'],
			[2, 'P2'],
			[3, 'P3'],
			[4, 'P4']
		]);
		expect(event?.standings[0].deck?.legends).toEqual(['a', 'b', 'c']);
		expect(event?.standings[0].deck?.main).toEqual([
			{ slug: 'm1', quantity: 3 },
			{ slug: 'm2', quantity: 2 }
		]);
		expect(event?.rounds.map((r) => r.number)).toEqual([1, 2, 3]);
		expect(event?.matches).toHaveLength(6);
	});

	it('leaves a player with no deck as a standing without one', async () => {
		const event = await getEventView(world().db, 2);
		expect(event?.standings.find((s) => s.name === 'P7')?.deck).toBeNull();
		expect(event?.deckCount).toBe(2);
	});

	it('is null for an event we do not have', async () => {
		expect(await getEventView(world().db, 999)).toBeNull();
	});
});
