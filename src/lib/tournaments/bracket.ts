/**
 * An event's playoff as a bracket: the rounds Melee names something other than "Round N"
 * (Quarterfinals, Semifinals, Finals), the matches in each, and who won them.
 *
 * Pure, over an `EventView`. Melee lists a round's matches by table, which is not the order a bracket
 * is drawn in, so each round is put in the order that feeds the next: working back from the final, the
 * matches the two finalists won to get there come first, and so on. A match that feeds nothing (a third
 * place playoff, say) follows the rest.
 */
import type { EventView, MatchView, StandingView } from './event-view.ts';

/** One player in a bracket match, with the list they played. */
export type BracketSide = {
	playerId: number;
	name: string;
	rank: number;
	/** The deck's Melee guid, when they registered one. */
	deck: string | null;
	legends: string[];
};

export type BracketMatch = {
	a: BracketSide;
	b: BracketSide;
	gamesA: number;
	gamesB: number;
	/** Null for a draw, or a match with no result. */
	winner: 'a' | 'b' | null;
};

export type BracketRound = { number: number; name: string; matches: BracketMatch[] };

export type Bracket = {
	rounds: BracketRound[];
	/** The winner of the last round, when it was one match with a result. */
	champion: BracketSide | null;
	/** Whether each round has half the matches of the one before, so lines can join them. */
	joined: boolean;
};

/** A Swiss round is "Round 4"; anything else is the playoff. */
const SWISS = /^round\s+\d+$/i;

const sideOf = (standing: StandingView): BracketSide => ({
	playerId: standing.playerId,
	name: standing.name,
	rank: standing.rank,
	deck: standing.deck?.guid ?? null,
	legends: standing.deck?.legends ?? []
});

function winnerOf(match: MatchView): 'a' | 'b' | null {
	if (match.kind !== 'played' || match.gamesA === match.gamesB) return null;
	return match.gamesA > match.gamesB ? 'a' : 'b';
}

/** The bracket, or null when the event has no playoff rounds (it was Swiss alone). */
export function buildBracket(
	event: Pick<EventView, 'rounds' | 'matches' | 'standings'>
): Bracket | null {
	const playoff = event.rounds.filter((round) => !SWISS.test(round.name.trim()));
	if (playoff.length === 0) return null;

	const standing = new Map(event.standings.map((s) => [s.playerId, s]));
	const side = (playerId: number): BracketSide | null => {
		const found = standing.get(playerId);
		return found ? sideOf(found) : null;
	};

	// Each round's real matches (a bye has no opponent), as bracket matches.
	const built = playoff.map((round) => ({
		number: round.number,
		name: round.name,
		matches: event.matches.flatMap((match): BracketMatch[] => {
			if (match.round !== round.number || match.b === null || match.kind === 'bye') return [];
			const [a, b] = [side(match.a.playerId), side(match.b.playerId)];
			if (!a || !b) return [];
			return [{ a, b, gamesA: match.gamesA, gamesB: match.gamesB, winner: winnerOf(match) }];
		})
	}));

	// Order from the final back: the matches that fed a match are the ones its players last played.
	const ordered = [...built];
	for (let r = ordered.length - 2; r >= 0; r -= 1) {
		const next = ordered[r + 1];
		const pool = [...ordered[r].matches];
		const taken: BracketMatch[] = [];
		for (const match of next.matches) {
			for (const player of [match.a.playerId, match.b.playerId]) {
				const at = pool.findIndex((m) => m.a.playerId === player || m.b.playerId === player);
				if (at >= 0) taken.push(...pool.splice(at, 1));
			}
		}
		ordered[r] = { ...ordered[r], matches: [...taken, ...pool] };
	}

	const rounds = ordered.filter((round) => round.matches.length > 0);
	const last = rounds.at(-1);
	const final = last?.matches.length === 1 ? last.matches[0] : undefined;
	return {
		rounds,
		champion: final?.winner ? final[final.winner === 'a' ? 'a' : 'b'] : null,
		joined: rounds.every(
			(round, i) => i === 0 || round.matches.length * 2 === rounds[i - 1].matches.length
		)
	};
}
