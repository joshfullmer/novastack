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
import { ALL_TIME, type Period, ANY_EVENTS } from '#lib/tournaments/period.js';
import { getEventKinds, getLines, getMeta, getMetas } from './tournament-stats.js';
import { createTestDb } from './test-db.js';
import { seedEvent } from './test-seed.js';
import { world as buildWorld, X, X_RAM, Y, Y_RAM } from './test-world.js';

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

	it('counts the Swiss rounds, or only the playoff, in the matrix', async () => {
		const { db, sqlite } = buildWorld();
		// Event 1's last round is its playoff: "Round 3" becomes "Finals". It holds X v Z (X won) and X v Y (Y won).
		sqlite.exec(
			"UPDATE tournament_rounds SET name = 'Finals' WHERE tournament_id = 1 AND number = 3"
		);
		const scope = { legends: false, rams: false, matchups: 'line' } as const;
		const [all, swiss, cut] = await Promise.all(
			(['all', 'swiss', 'cut'] as const).map((phase) => getMeta(db, ALL_TIME, { ...scope, phase }))
		);
		const cell = (meta: typeof all, a: string, b: string) =>
			meta.matrix.find((c) => c.a === a && c.b === b);
		expect(cell(cut, 'a+b+c', 'e+f+g')).toMatchObject({ matches: 1, winRate: 1 });
		expect(cell(cut, 'a+b+c', 'a+b+d')).toMatchObject({ matches: 1, winRate: 0 });
		expect(cut.crossMatches).toBe(2);
		expect(cell(cut, 'e+f+g', 'a+b+d')).toMatchObject({ matches: 0, winRate: null });
		// Every match is in one phase or the other
		expect(swiss.crossMatches + cut.crossMatches).toBe(all.crossMatches);
		expect(swiss.crossMatchesTotal + cut.crossMatchesTotal).toBe(all.crossMatchesTotal);
		expect(cell(swiss, 'a+b+c', 'e+f+g')).toMatchObject({ matches: 1 });
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

describe('getMeta, by RAM', () => {
	it('groups decks by what their Legends provide together, one group per RAM', async () => {
		const meta = await getMeta(world(), ALL_TIME);
		// X (3 decks) is rryyyy, Y (2) is rrrryy, Z (1) is bbbbgg.
		expect(meta.byRam.map((g) => [g.key, g.decks])).toEqual([
			['rryyyy', 3],
			['rrrryy', 2],
			['bbbbgg', 1]
		]);
		expect(meta.byRam[0]).toMatchObject({ legends: [], winRate: 6 / 8, top8: 3, wins: 1 });
		expect(meta.byRam.map((g) => g.share)).toEqual([3 / 6, 2 / 6, 1 / 6]);
	});

	it('keeps YYR and RRY apart, though both are Red and Yellow', async () => {
		const meta = await getMeta(world(), ALL_TIME);
		expect(meta.byRam.filter((g) => g.key.includes('y') && g.key.includes('r'))).toHaveLength(2);
	});

	it('leaves out decks whose RAM is unknown, and counts shares of the rest', async () => {
		const { db, sqlite } = createTestDb();
		seedEvent(sqlite, {
			id: 1,
			name: 'E',
			startsAt: '2026-11-15T12:00:00Z',
			players: [
				{
					id: 1,
					name: 'P1',
					rank: 1,
					wins: 1,
					losses: 0,
					deck: { guid: 'A', legends: X, ram: X_RAM }
				},
				{ id: 2, name: 'P2', rank: 2, wins: 0, losses: 1, deck: { guid: 'B', legends: Y } }
			],
			matches: [{ round: 1, a: 1, b: 2, gamesA: 2, gamesB: 0 }]
		});
		const meta = await getMeta(db, ALL_TIME);
		expect(meta.byRam.map((g) => [g.key, g.decks, g.share])).toEqual([['rryyyy', 1, 1]]);
		expect(meta.byLine).toHaveLength(2); // the lines are still known
	});

	it('draws the matrix over RAMs, where two lines with the same RAM are one deck and do not meet', async () => {
		const { db, sqlite } = createTestDb();
		// Two different Legend lines that both come to rryyyy (Smasher/River/Viktor, Smasher/River/Muamar),
		// and one rrrryy. P1 and P2 play the same RAM, so that match is a mirror.
		seedEvent(sqlite, {
			id: 1,
			name: 'E',
			startsAt: '2026-11-15T12:00:00Z',
			players: [
				{
					id: 1,
					name: 'P1',
					rank: 1,
					wins: 2,
					losses: 0,
					deck: { guid: 'A', legends: X, ram: X_RAM }
				},
				{
					id: 2,
					name: 'P2',
					rank: 2,
					wins: 1,
					losses: 1,
					deck: { guid: 'B', legends: ['a', 'b', 'm'], ram: X_RAM }
				},
				{
					id: 3,
					name: 'P3',
					rank: 3,
					wins: 0,
					losses: 2,
					deck: { guid: 'C', legends: Y, ram: Y_RAM }
				}
			],
			matches: [
				{ round: 1, a: 1, b: 2, gamesA: 2, gamesB: 0 },
				{ round: 2, a: 1, b: 3, gamesA: 2, gamesB: 0 },
				{ round: 3, a: 2, b: 3, gamesA: 2, gamesB: 1 }
			]
		});
		const byLine = await getMeta(db, ALL_TIME, { legends: false, rams: false, matchups: 'line' });
		expect(byLine.matrixLines).toHaveLength(3);
		expect(byLine.crossMatches).toBe(3);

		const byRam = await getMeta(db, ALL_TIME, { legends: false, rams: true, matchups: 'ram' });
		expect(byRam.matrixBy).toBe('ram');
		expect(byRam.matrixLines).toEqual(['rryyyy', 'rrrryy']);
		expect(byRam.crossMatches).toBe(2); // A and B beat C; A v B is a mirror
		expect(byRam.crossMatchesTotal).toBe(2);
		const cell = byRam.matrix.find((c) => c.a === 'rryyyy' && c.b === 'rrrryy');
		expect(cell).toMatchObject({ matches: 2, winRate: 1 });
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
		to: Date.parse('2026-11-17T00:00:00Z'),
		param: null,
		...ANY_EVENTS
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
			to: Date.parse('2026-11-16T12:00:00Z'),
			param: null,
			...ANY_EVENTS
		};
		expect((await getMeta(world(), upToNov16)).decks).toBe(4); // event 2 starts exactly at `to`
		const fromNov16: Period = {
			id: 4,
			name: 'y',
			from: Date.parse('2026-11-16T12:00:00Z'),
			to: null,
			param: null,
			...ANY_EVENTS
		};
		expect((await getMeta(world(), fromNov16)).decks).toBe(2); // and `from` is inclusive
	});

	it('is empty, not an error, for a window with nothing in it', async () => {
		const none: Period = {
			id: 9,
			name: 'none',
			from: Date.parse('2030-01-01'),
			to: null,
			param: null,
			...ANY_EVENTS
		};
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

describe('narrowing which events count', () => {
	const counts = async (scope: Partial<Period>) =>
		Object.fromEntries(
			(await getLines(world(), { ...ALL_TIME, ...scope })).map((g) => [g.key, g.decks])
		);

	it('counts every event by default: X 3, Y 2, Z 1', async () => {
		expect(await counts({})).toEqual({ 'a+b+c': 3, 'a+b+d': 2, 'e+f+g': 1 });
	});

	it('keeps only events with enough players: event 1 has 4, event 2 has 3', async () => {
		expect(await counts({ minPlayers: 4 })).toEqual({ 'a+b+c': 2, 'a+b+d': 1, 'e+f+g': 1 });
		expect(await counts({ minPlayers: 5 })).toEqual({});
	});

	it('keeps only events of a kind: event 1 is a Showdown, event 2 a Regional', async () => {
		expect(await counts({ kinds: ['Regional'] })).toEqual({ 'a+b+c': 1, 'a+b+d': 1 });
		expect(await counts({ kinds: ['Brawl'] })).toEqual({});
	});

	it('keeps events of any of several kinds, and all of them when none is chosen', async () => {
		const both = await counts({ kinds: ['Regional', 'Showdown'] });
		expect(both).toEqual(await counts({}));
		expect(await counts({ kinds: ['Showdown', 'Brawl'] })).toEqual(
			await counts({ kinds: ['Showdown'] })
		);
		expect(await counts({ kinds: ['Regional', 'Brawl'] })).toEqual(
			await counts({ kinds: ['Regional'] })
		);
	});

	it('combines with the window and with each other', async () => {
		const nov16 = Date.parse('2026-11-16T00:00:00Z');
		expect(await counts({ from: nov16, kinds: ['Showdown'] })).toEqual({});
		expect(await counts({ from: nov16, kinds: ['Regional'], minPlayers: 3 })).toEqual({
			'a+b+c': 1,
			'a+b+d': 1
		});
	});

	it('reaches the Legend and card aggregates, not just the lines', async () => {
		const meta = await getMeta(world(), { ...ALL_TIME, kinds: ['Regional'] });
		expect(meta.byLegend.map((g) => [g.key, g.decks])).toEqual([
			['a', 2],
			['b', 2],
			// c and d are tied on decks; d is in D5, the event winner's, so it ranks first.
			['d', 1],
			['c', 1]
		]);
	});

	it('lists the kinds that exist, in the usual order, so a selector offers only real choices', async () => {
		expect(await getEventKinds(world())).toEqual(['Regional', 'Showdown']);
		expect(await getEventKinds(createTestDb().db)).toEqual([]);
	});
});
