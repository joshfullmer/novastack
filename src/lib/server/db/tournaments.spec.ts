/**
 * The event page's and list page's queries, run for real over the shared world (`test-world.ts`) plus
 * two awkward events: one whose champion registered no deck, and one with no decks at all.
 */
import { describe, expect, it } from 'vitest';
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
		const events = await getEventList(withAwkwardEvents());
		expect(events.map((e) => e.id)).toEqual([4, 3, 2, 1]);
		const [, , two, one] = events;
		expect(one).toMatchObject({ deckCount: 4, roundCount: 3, winner: 'P1', playerCount: 4 });
		expect(two).toMatchObject({ deckCount: 2, roundCount: 2, winner: 'P5', playerCount: 3 });
	});

	it("shows the winner's deck when there is one", async () => {
		const [, , , one] = await getEventList(withAwkwardEvents());
		expect(one.showcase).toEqual({ rank: 1, name: 'P1', legends: ['a', 'b', 'c'] });
	});

	it('shows the best-placed player who has a deck when the winner has none', async () => {
		const [, three] = await getEventList(withAwkwardEvents());
		expect(three.winner).toBe('P8');
		expect(three.showcase).toEqual({ rank: 2, name: 'P9', legends: ['h', 'i', 'j'] });
	});

	it('has no showcase, and still a winner, for an event with no decks', async () => {
		const [four] = await getEventList(withAwkwardEvents());
		expect(four).toMatchObject({ winner: 'P11', showcase: null, deckCount: 0, field: [] });
	});

	it('counts how many decks ran each Legend', async () => {
		const [, , , one] = await getEventList(withAwkwardEvents());
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
		expect(await getEventList(createTestDb().db)).toEqual([]);
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
