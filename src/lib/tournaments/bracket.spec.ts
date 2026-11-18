import { describe, expect, it } from 'vitest';
import { buildBracket } from './bracket.ts';
import type { MatchView, StandingView } from './event-view.ts';

const standing = (playerId: number, rank: number): StandingView => ({
	rank,
	playerId,
	name: `P${playerId}`,
	points: 0,
	wins: 0,
	losses: 0,
	draws: 0,
	deck: {
		guid: `D${playerId}`,
		name: '',
		legends: [`l${playerId}`],
		main: [],
		side: [],
		unresolved: 0
	}
});
const match = (round: number, a: number, b: number | null, gamesA = 2, gamesB = 0): MatchView => ({
	round,
	table: null,
	a: { playerId: a, name: `P${a}` },
	b: b === null ? null : { playerId: b, name: `P${b}` },
	gamesA,
	gamesB,
	draws: 0,
	kind: b === null ? 'bye' : 'played'
});

const players = Array.from({ length: 8 }, (_, i) => standing(i + 1, i + 1));
const rounds = [
	{ number: 1, name: 'Round 1' },
	{ number: 2, name: 'Quarterfinals' },
	{ number: 3, name: 'Semifinals' },
	{ number: 4, name: 'Finals' }
];

describe('buildBracket', () => {
	it('is null when an event has only Swiss rounds', () => {
		const swiss = buildBracket({
			rounds: [
				{ number: 1, name: 'Round 1' },
				{ number: 2, name: 'Round 2' }
			],
			matches: [match(1, 1, 2), match(2, 1, 3)],
			standings: players
		});
		expect(swiss).toBeNull();
	});

	it('keeps only the playoff rounds, and names the champion', () => {
		const bracket = buildBracket({
			rounds,
			matches: [match(1, 1, 8), match(3, 1, 4), match(3, 2, 3, 0, 2), match(4, 1, 3, 2, 1)],
			standings: players
		});
		expect(bracket?.rounds.map((r) => r.name)).toEqual(['Semifinals', 'Finals']);
		expect(bracket?.champion).toMatchObject({ playerId: 1, name: 'P1', deck: 'D1' });
	});

	it('draws each round in the order that feeds the next, whatever order Melee listed it in', () => {
		// Quarterfinals as tables 1-4, listed 5v6, 1v8, 3v7, 2v4 — nothing like a bracket's order.
		const bracket = buildBracket({
			rounds,
			matches: [
				match(2, 5, 6),
				match(2, 1, 8),
				match(2, 3, 7),
				match(2, 2, 4),
				// Semis: 1 beat 5's side? 5 beat 6 -> faces 1; 3 beat 7 -> faces 2
				match(3, 5, 1, 0, 2),
				match(3, 3, 2, 0, 2),
				match(4, 1, 2, 2, 1)
			],
			standings: players
		});
		const [quarters, semis, finals] = bracket?.rounds ?? [];
		expect(semis?.matches.map((m) => [m.a.playerId, m.b.playerId])).toEqual([
			[5, 1],
			[3, 2]
		]);
		// Semi 1 is 5 v 1, so its quarters are the ones 5 and 1 played; semi 2 is 3 v 2.
		expect(quarters?.matches.map((m) => [m.a.playerId, m.b.playerId])).toEqual([
			[5, 6],
			[1, 8],
			[3, 7],
			[2, 4]
		]);
		expect(finals?.matches).toHaveLength(1);
		expect(bracket?.joined).toBe(true);
	});

	it('reads a winner from the games, and none from a draw', () => {
		const bracket = buildBracket({
			rounds: [{ number: 1, name: 'Finals' }],
			matches: [match(1, 1, 2, 1, 1)],
			standings: players
		});
		expect(bracket?.rounds[0].matches[0].winner).toBeNull();
		expect(bracket?.champion).toBeNull();
	});

	it('leaves out a bye, and says the rounds do not join when they do not halve', () => {
		const bracket = buildBracket({
			rounds,
			matches: [
				match(2, 1, 8),
				match(2, 2, null),
				match(2, 3, 6),
				match(3, 1, 3),
				match(3, 2, 4),
				match(4, 1, 2)
			],
			standings: players
		});
		expect(bracket?.rounds[0].matches).toHaveLength(2);
		expect(bracket?.joined).toBe(false);
	});
});
