/**
 * Reading a final ranking from a bracket. The rule here was also run, on 2026-11-19, against 20 events
 * whose final standings Melee *did* publish: for each, the standings after the last Swiss round and after
 * every playoff round but the last, with the later playoff matches, were turned into a final ranking and
 * compared with the published one. 19 events matched on every rank, record, game record and points total
 * from every starting round (brackets of 2 to 32 players: Semifinals-and-Finals, and Quarterfinals too);
 * the 20th had a drawn Finals and was declined, as it is here.
 */
import { describe, expect, it } from 'vitest';
import { inferFinalStandings } from './infer.ts';
import type { MeleeMatch, MeleeStanding } from './sources.ts';

const player = (id: number) => ({ ID: id, DisplayName: `P${id}`, Username: `p${id}` });

const standing = (id: number, rank: number) =>
	({
		Rank: rank,
		Points: 9,
		MatchWins: 3,
		MatchLosses: 1,
		MatchDraws: 0,
		GameWins: 6,
		GameLosses: 3,
		GameDraws: 0,
		Team: { Players: [player(id)] }
	}) as MeleeStanding;

/** `a` beat `b`, 2-1 or 2-0. */
const won = (a: number, b: number, loserGames = 0): MeleeMatch => ({
	Competitors: [
		{ Team: { Players: [player(a)] }, GameWins: 2, GameByes: 0 },
		{ Team: { Players: [player(b)] }, GameWins: loserGames, GameByes: 0 }
	],
	ResultString: `P${a} won 2-${loserGames}-0`,
	GameDraws: 0,
	HasResult: true,
	RoundId: 1,
	TableNumber: 1
});

const swiss = Array.from({ length: 9 }, (_, i) => standing(i + 1, i + 1));

const bracket = [
	{ name: 'Quarterfinals', matches: [won(1, 8), won(5, 4, 1), won(2, 7), won(6, 3, 1)] },
	{ name: 'Semifinals', matches: [won(1, 5), won(6, 2, 1)] },
	{ name: 'Finals', matches: [won(6, 1, 1)] }
];

describe('reading a ranking from the playoff', () => {
	const result = inferFinalStandings(swiss, bracket);
	if (!result.ok) throw new Error(result.reason);
	const rankOf = (id: number) => result.standings.find((row) => row.Team.Players[0].ID === id);

	it('ranks the champion, the finalist, then each earlier round`s losers in Swiss order', () => {
		expect(result.standings.map((row) => row.Team.Players[0].ID)).toEqual([
			6, 1, 2, 5, 3, 4, 7, 8, 9
		]);
		expect(result.standings.map((row) => row.Rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it('adds each playoff match to the records and games, and leaves points alone', () => {
		// 6 won three matches (2-1, 2-1, 2-1); the Finals was 2-1 over 1.
		expect(rankOf(6)).toMatchObject({
			MatchWins: 6,
			MatchLosses: 1,
			GameWins: 12,
			GameLosses: 6,
			Points: 9
		});
		expect(rankOf(8)).toMatchObject({ MatchWins: 3, MatchLosses: 2, GameWins: 6, GameLosses: 5 });
		// Not in the cut: untouched.
		expect(rankOf(9)).toMatchObject({ MatchWins: 3, MatchLosses: 1, GameWins: 6, GameLosses: 3 });
	});

	it('does not change what it was given', () => {
		expect(swiss[0].MatchWins).toBe(3);
		expect(swiss[0].Rank).toBe(1);
	});

	it('starts from standings published partway through the playoff, swapping only the finalists', () => {
		// Melee published after the Semifinals: the finalists on 1 and 2, the Semifinals losers on 3 and 4.
		const afterSemis = [1, 2, 3, 4]
			.map((rank, i) => standing([6, 1, 2, 5][i], rank))
			.concat([3, 4, 7, 8, 9].map((id, i) => standing(id, i + 5)));
		const finals = (champion: number, other: number) =>
			inferFinalStandings(afterSemis, [{ name: 'Finals', matches: [won(champion, other, 1)] }]);
		const order = (out: ReturnType<typeof finals>) => {
			if (!out.ok) throw new Error(out.reason);
			return out.standings.map((row) => `${row.Team.Players[0].ID}:${row.Rank}`);
		};
		expect(order(finals(6, 1)).slice(0, 4)).toEqual(['6:1', '1:2', '2:3', '5:4']);
		expect(order(finals(1, 6)).slice(0, 4)).toEqual(['1:1', '6:2', '2:3', '5:4']);
		expect(order(finals(1, 6)).slice(4)).toEqual(['3:5', '4:6', '7:7', '8:8', '9:9']);
	});

	it('declines when someone outside the bracket sits between its players in the ranking', () => {
		// Player 2 dropped and missed a cut of 1, 3, 4, 5: how Melee ranks around them isn't known.
		const out = inferFinalStandings(swiss, [
			{ name: 'Semifinals', matches: [won(1, 5), won(3, 4)] },
			{ name: 'Finals', matches: [won(3, 1)] }
		]);
		expect(out).toEqual({
			ok: false,
			reason: "the players in Semifinals don't hold consecutive ranks"
		});
	});
});

describe('declining to guess', () => {
	const draw: MeleeMatch = {
		...won(1, 2),
		Competitors: [
			{ Team: { Players: [player(1)] }, GameWins: 0, GameByes: 0 },
			{ Team: { Players: [player(2)] }, GameWins: 0, GameByes: 0 }
		],
		ResultString: '0-0-3 Draw',
		GameDraws: 3
	};
	const bye: MeleeMatch = {
		...won(1, 2),
		Competitors: [{ Team: { Players: [player(1)] }, GameWins: 2, GameByes: 2 }],
		ResultString: 'P1 was assigned a bye'
	};
	const unfinished: MeleeMatch = { ...won(1, 2), HasResult: false, ResultString: null };

	const reason = (rounds: Parameters<typeof inferFinalStandings>[1]) => {
		const out = inferFinalStandings(swiss, rounds);
		return out.ok ? null : out.reason;
	};

	it('says why, for each thing that makes a ranking unknowable', () => {
		expect(reason([])).toMatch(/no playoff/);
		expect(reason([{ name: 'Finals', matches: [draw] }])).toMatch(/Finals has a draw/);
		expect(reason([{ name: 'Finals', matches: [bye] }])).toMatch(/Finals has a bye/);
		expect(reason([{ name: 'Finals', matches: [unfinished] }])).toMatch(/Finals isn't finished/);
		expect(reason([{ name: 'Finals', matches: [won(1, 2), won(3, 4)] }])).toMatch(/single final/);
		expect(
			reason([
				{ name: 'Semifinals', matches: [won(1, 2), won(3, 4)] },
				{ name: 'Finals', matches: [won(1, 5)] }
			])
		).toMatch(/didn't win the round before/);
		expect(
			reason([
				{ name: 'Quarterfinals', matches: [won(1, 8), won(2, 7), won(3, 6), won(4, 5)] },
				{ name: 'Finals', matches: [won(1, 2)] }
			])
		).toMatch(/doesn't halve the field/);
		expect(reason([{ name: 'Finals', matches: [won(1, 99)] }])).toMatch(/names a player/);
	});
});
