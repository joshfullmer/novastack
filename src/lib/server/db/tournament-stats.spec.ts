/**
 * The meta aggregates, run for real: the actual queries over a SQLite built from our migrations, against
 * a world small enough to count by hand. Every expected number below is worked out in the comments.
 *
 * Three Legend lines: X = a+b+c, Y = a+b+d, Z = e+f+g.
 *
 *   Nov 15, event 1 (4 players)            Nov 16, event 2 (3 players)
 *   P1 rank 1  3-0  X                      P5 rank 1  2-0  Y
 *   P2 rank 2  2-1  X                      P6 rank 2  1-1  X
 *   P3 rank 3  1-2  Y                      P7 rank 3  0-2  (no deck)
 *   P4 rank 4  0-3  Z
 */
import { describe, expect, it } from 'vitest';
import { ALL_TIME, type Period } from '#lib/tournaments/period.js';
import { getMeta, getMetas } from './tournament-stats.js';
import { createTestDb } from './test-db.js';
import { seedEvent } from './test-seed.js';
import { world as buildWorld } from './test-world.js';

const world = () => buildWorld().db;

describe('getMeta, all time', () => {
	it('counts decks per Legend line and ranks them, ignoring the player with no deck', async () => {
		const meta = await getMeta(world(), ALL_TIME);
		expect(meta.decks).toBe(6); // D1..D6: P7 has no deck
		// X: D1 D2 D6; Y: D3 D5; Z: D4
		expect(meta.byLine.map((g) => [g.key, g.decks])).toEqual([
			['a+b+c', 3],
			['a+b+d', 2],
			['e+f+g', 1]
		]);
		expect(meta.byLine.map((g) => g.share)).toEqual([3 / 6, 2 / 6, 1 / 6]);
	});

	it('recovers each line’s Legends from its key', async () => {
		const meta = await getMeta(world(), ALL_TIME);
		expect(meta.byLine[0].legends).toEqual(['a', 'b', 'c']);
	});

	it('works out match win rate, top 8 and event wins per line', async () => {
		const [x, y, z] = (await getMeta(world(), ALL_TIME)).byLine;
		// X: matches won 3+2+1 = 6, lost 0+1+1 = 2  -> 6/8; all three in the top 8; D1 won event 1
		expect(x).toMatchObject({ matches: 8, winRate: 6 / 8, top8: 3, wins: 1 });
		// Y: won 1+2 = 3, lost 2+0 = 2 -> 3/5; D5 won event 2
		expect(y).toMatchObject({ matches: 5, winRate: 3 / 5, top8: 2, wins: 1 });
		// Z: 0-3
		expect(z).toMatchObject({ matches: 3, winRate: 0, top8: 1, wins: 0 });
	});

	it('counts a deck once per Legend when grouping by Legend', async () => {
		const meta = await getMeta(world(), ALL_TIME);
		const by = new Map(meta.byLegend.map((g) => [g.key, g]));
		// a and b are in X (3 decks) and Y (2 decks); c only X; d only Y; e f g only Z
		expect([...by.keys()].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
		expect(by.get('a')).toMatchObject({ decks: 5, legends: ['a'], matches: 13 }); // 9 won + 4 lost
		expect(by.get('a')?.winRate).toBeCloseTo(9 / 13);
		expect(by.get('c')?.decks).toBe(3);
		expect(by.get('e')?.decks).toBe(1);
	});

	it('builds the matchup matrix from decks of different lines, both ways round', async () => {
		const meta = await getMeta(world(), ALL_TIME);
		expect(meta.matrixLines).toEqual(['a+b+c', 'a+b+d', 'e+f+g']);
		const cell = (a: string, b: string) => meta.matrix.find((c) => c.a === a && c.b === b);
		// X v Y: X won 1 of 3 (R1 won; R3 lost; event 2 lost)
		expect(cell('a+b+c', 'a+b+d')).toMatchObject({ matches: 3, winRate: 1 / 3 });
		expect(cell('a+b+d', 'a+b+c')).toMatchObject({ matches: 3, winRate: 2 / 3 });
		// X v Z: X won both
		expect(cell('a+b+c', 'e+f+g')).toMatchObject({ matches: 2, winRate: 1 });
		expect(cell('e+f+g', 'a+b+c')).toMatchObject({ matches: 2, winRate: 0 });
		// Y v Z: Y won the one
		expect(cell('a+b+d', 'e+f+g')).toMatchObject({ matches: 1, winRate: 1 });
	});

	it('leaves mirrors, byes and matches with a deck-less player out of the matrix', async () => {
		const meta = await getMeta(world(), ALL_TIME);
		// 6 cross-deck matches; not the X mirror, the no-deck player's match, or the bye
		expect(meta.crossMatches).toBe(6);
		expect(meta.crossMatchesTotal).toBe(6); // all three lines are in the matrix
		expect(meta.matrix.find((c) => c.a === 'a+b+c' && c.b === 'a+b+c')).toMatchObject({
			matches: 0,
			winRate: null
		});
	});
});

describe('getMeta, with more lines than the matrix draws', () => {
	// Ten players, ten different one-deck lines, each meeting the next: nine matches between decks
	// of different lines, but the matrix only draws eight lines.
	function crowded() {
		const { db, sqlite } = createTestDb();
		seedEvent(sqlite, {
			id: 1,
			name: 'Crowded',
			startsAt: '2026-11-15T12:00:00Z',
			players: Array.from({ length: 10 }, (_, i) => ({
				id: i + 1,
				name: `P${i + 1}`,
				rank: i + 1,
				wins: 1,
				losses: 0,
				deck: { guid: `G${i + 1}`, legends: [`l${i + 1}a`, `l${i + 1}b`, `l${i + 1}c`] }
			})),
			matches: Array.from({ length: 9 }, (_, i) => ({
				round: 1,
				a: i + 1,
				b: i + 2,
				gamesA: 2,
				gamesB: 0
			}))
		});
		return db;
	}

	it('counts every cross-line match as the total, and only the drawn lines in the matrix', async () => {
		const meta = await getMeta(crowded(), ALL_TIME);
		expect(meta.matrixLines).toHaveLength(8);
		expect(meta.crossMatchesTotal).toBe(9);
		// a match counts in the matrix only when BOTH its lines are drawn
		const drawn = new Set(meta.matrixLines);
		const line = (n: number) => [`l${n}a`, `l${n}b`, `l${n}c`].sort().join('+');
		const expected = Array.from({ length: 9 }, (_, i) => i + 1).filter(
			(n) => drawn.has(line(n)) && drawn.has(line(n + 1))
		).length;
		expect(meta.crossMatches).toBe(expected);
		expect(meta.crossMatches).toBeLessThan(meta.crossMatchesTotal);
	});
});

describe('getMeta, by period', () => {
	const nov16: Period = {
		id: 2,
		name: 'Nov 16',
		from: Date.parse('2026-11-16T00:00:00Z'),
		to: Date.parse('2026-11-17T00:00:00Z')
	};

	it('counts only the events that started inside the window', async () => {
		const meta = await getMeta(world(), nov16);
		expect(meta.decks).toBe(2); // D5 and D6
		expect(meta.byLine.map((g) => [g.key, g.decks]).sort()).toEqual([
			['a+b+c', 1],
			['a+b+d', 1]
		]);
		expect(meta.crossMatches).toBe(1); // only P5 v P6
	});

	it('treats the end as exclusive and an open side as unbounded', async () => {
		const upToNov16: Period = {
			id: 3,
			name: 'x',
			from: null,
			to: Date.parse('2026-11-16T12:00:00Z')
		};
		expect((await getMeta(world(), upToNov16)).decks).toBe(4); // event 2 starts exactly at `to`
		const fromNov16: Period = {
			id: 4,
			name: 'y',
			from: Date.parse('2026-11-16T12:00:00Z'),
			to: null
		};
		expect((await getMeta(world(), fromNov16)).decks).toBe(2); // and `from` is inclusive
	});

	it('is empty, not an error, for a window with nothing in it', async () => {
		const none: Period = { id: 9, name: 'none', from: Date.parse('2030-01-01'), to: null };
		const meta = await getMeta(world(), none);
		expect(meta).toMatchObject({ decks: 0, byLine: [], byLegend: [], matrixLines: [], matrix: [] });
	});
});

describe('getMetas', () => {
	it('reads the metas table (empty until someone seeds it)', async () => {
		const { db, sqlite } = createTestDb();
		expect(await getMetas(db)).toEqual([]);
		sqlite.exec("INSERT INTO metas (name, starts_on, ends_on) VALUES ('Launch', 1000, NULL)");
		const [meta] = await getMetas(db);
		expect(meta).toMatchObject({ name: 'Launch', endsOn: null });
		expect(meta.startsOn.getTime()).toBe(1000);
	});
});
