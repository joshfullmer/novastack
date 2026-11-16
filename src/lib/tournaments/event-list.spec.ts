import { describe, expect, it } from 'vitest';
import { buildEventList, type EventListRows } from './event-list.ts';

const event = (id: number, startsAt: string, name = `Event ${id}`) => ({
	id,
	name,
	startsAt: new Date(startsAt),
	organizerId: 1,
	organizerName: 'Organizer',
	format: 'Constructed',
	formatId: 'f',
	playerCount: 10,
	ingestedAt: new Date(0)
});

const rows = (over: Partial<EventListRows> = {}): EventListRows => ({
	tournaments: [event(1, '2026-11-15T00:00:00Z'), event(2, '2026-11-16T00:00:00Z')],
	rounds: [
		{ tournamentId: 1, rounds: 5 },
		{ tournamentId: 2, rounds: 4 }
	],
	decks: [{ tournamentId: 2, decks: 13 }],
	winners: [
		{ tournamentId: 1, name: 'Ana' },
		{ tournamentId: 2, name: 'Bo' }
	],
	showcase: [
		{ tournamentId: 2, rank: 1, name: 'Bo', cardSlug: 'v' },
		{ tournamentId: 2, rank: 1, name: 'Bo', cardSlug: 'alt' },
		{ tournamentId: 2, rank: 1, name: 'Bo', cardSlug: 'jackie' }
	],
	legends: [
		{ tournamentId: 2, cardSlug: 'v', decks: 5 },
		{ tournamentId: 2, cardSlug: 'alt', decks: 9 }
	],
	...over
});

describe('the tournament list', () => {
	it('lists the newest event first', () => {
		expect(buildEventList(rows()).map((e) => e.id)).toEqual([2, 1]);
	});

	it('breaks a tie on start time by id, so the order is stable', () => {
		const same = rows({
			tournaments: [event(1, '2026-11-15T00:00:00Z'), event(7, '2026-11-15T00:00:00Z')]
		});
		expect(buildEventList(same).map((e) => e.id)).toEqual([7, 1]);
	});

	it('carries counts, and zero for an event the aggregates never mention', () => {
		const [two, one] = buildEventList(rows());
		expect(two).toMatchObject({
			deckCount: 13,
			roundCount: 4,
			winner: 'Bo',
			organizer: 'Organizer'
		});
		expect(one).toMatchObject({
			deckCount: 0,
			roundCount: 5,
			winner: 'Ana',
			showcase: null,
			field: []
		});
	});

	it("sorts the showcase's Legends and the field by how many decks ran them", () => {
		const [two] = buildEventList(rows());
		expect(two.showcase).toEqual({ rank: 1, name: 'Bo', legends: ['alt', 'jackie', 'v'] });
		expect(two.field).toEqual([
			{ slug: 'alt', decks: 9 },
			{ slug: 'v', decks: 5 }
		]);
	});

	it('shows the next player with a deck when the winner registered none, and says which rank', () => {
		const [two] = buildEventList(
			rows({
				winners: [{ tournamentId: 2, name: 'Champion with no list' }],
				showcase: [{ tournamentId: 2, rank: 3, name: 'Third', cardSlug: 'v' }]
			})
		);
		expect(two.winner).toBe('Champion with no list');
		expect(two.showcase).toMatchObject({ rank: 3, name: 'Third' });
	});

	it('is empty when nothing has been ingested', () => {
		expect(buildEventList(rows({ tournaments: [] }))).toEqual([]);
	});
});
