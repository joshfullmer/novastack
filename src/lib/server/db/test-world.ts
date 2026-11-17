/**
 * The small tournament world the data-layer specs share, hand-countable on purpose. Only for tests.
 *
 * Event 1 is a Showdown, event 2 a Regional.
 *
 * Three Legend lines: X = a+b+c, Y = a+b+d, Z = e+f+g. Cards: m1 m2 m3 (main decks), s1 (a sideboard).
 *
 *   Nov 15, event 1 (4 players, 3 rounds)         Nov 16, event 2 (3 players, 2 rounds)
 *   P1 rank 1  3-0  D1 X  m1×3 m2×2 / s1×1        P5 rank 1  2-0  D5 Y  m1×3 m3×1
 *   P2 rank 2  2-1  D2 X  m1×3                    P6 rank 2  1-1  D6 X  m2×2 / m1×1
 *   P3 rank 3  1-2  D3 Y  m1×2 m2×3 / m2×1        P7 rank 3  0-2  (no deck)
 *   P4 rank 4  0-3  D4 Z  m3×3
 *
 * Matches: E1 R1 P1>P3, P2>P4; R2 P1>P2 (mirror), P3>P4; R3 P1>P4, P3>P2.   E2 R1 P5>P6; R2 P6>P7, P5 bye.
 */
import { createTestDb } from './test-db.js';
import { seedEvent } from './test-seed.js';

export const X = ['a', 'b', 'c'];
export const Y = ['a', 'b', 'd'];
export const Z = ['e', 'f', 'g'];

export function world() {
	const { db, sqlite } = createTestDb();
	seedEvent(sqlite, {
		id: 1,
		name: 'Event 1',
		kind: 'Showdown',
		startsAt: '2026-11-15T12:00:00Z',
		rounds: 3,
		players: [
			{
				id: 1,
				name: 'P1',
				rank: 1,
				wins: 3,
				losses: 0,
				deck: { guid: 'D1', legends: X, main: { m1: 3, m2: 2 }, side: { s1: 1 } }
			},
			{
				id: 2,
				name: 'P2',
				rank: 2,
				wins: 2,
				losses: 1,
				deck: { guid: 'D2', legends: X, main: { m1: 3 } }
			},
			{
				id: 3,
				name: 'P3',
				rank: 3,
				wins: 1,
				losses: 2,
				deck: { guid: 'D3', legends: Y, main: { m1: 2, m2: 3 }, side: { m2: 1 } }
			},
			{
				id: 4,
				name: 'P4',
				rank: 4,
				wins: 0,
				losses: 3,
				deck: { guid: 'D4', legends: Z, main: { m3: 3 } }
			}
		],
		matches: [
			{ round: 1, a: 1, b: 3, gamesA: 2, gamesB: 0 },
			{ round: 1, a: 2, b: 4, gamesA: 2, gamesB: 1 },
			{ round: 2, a: 1, b: 2, gamesA: 2, gamesB: 0 },
			{ round: 2, a: 3, b: 4, gamesA: 2, gamesB: 0 },
			{ round: 3, a: 1, b: 4, gamesA: 2, gamesB: 0 },
			{ round: 3, a: 2, b: 3, gamesA: 1, gamesB: 2 }
		]
	});
	seedEvent(sqlite, {
		id: 2,
		name: 'Event 2',
		kind: 'Regional',
		startsAt: '2026-11-16T12:00:00Z',
		rounds: 2,
		players: [
			{
				id: 5,
				name: 'P5',
				rank: 1,
				wins: 2,
				losses: 0,
				deck: { guid: 'D5', legends: Y, main: { m1: 3, m3: 1 } }
			},
			{
				id: 6,
				name: 'P6',
				rank: 2,
				wins: 1,
				losses: 1,
				deck: { guid: 'D6', legends: X, main: { m2: 2 }, side: { m1: 1 } }
			},
			{ id: 7, name: 'P7', rank: 3, wins: 0, losses: 2 }
		],
		matches: [
			{ round: 1, a: 5, b: 6, gamesA: 2, gamesB: 1 },
			{ round: 2, a: 6, b: 7, gamesA: 2, gamesB: 0 },
			{ round: 2, a: 5, b: null, gamesA: 2, gamesB: 0 }
		]
	});
	return { db, sqlite };
}
