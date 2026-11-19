/**
 * An event's playoff as a bracket: the rounds Melee names something other than "Round N"
 * (Quarterfinals, Semifinals, Finals), the matches in each, and who won them.
 *
 * Pure, over an `EventView`. Melee lists a round's matches by table, which is not the order a bracket
 * is drawn in, so each round is put in the order that feeds the next: working back from the final, the
 * matches the two finalists won to get there come first, and so on. A match that feeds nothing (a third
 * place playoff, say) follows the rest.
 */
import { isPlayoffRound } from './rounds.ts';
import type { EventView, MatchView, StandingView } from './event-view.ts';

/** One player in a bracket match, with the list they played. */
export type BracketSide = {
	playerId: number;
	name: string;
	rank: number;
	/** Their record over the whole event. */
	record: { wins: number; losses: number; draws: number };
	/** The deck's Melee guid, when they registered one. */
	deck: string | null;
	legends: string[];
};

export type BracketMatch = {
	a: BracketSide;
	b: BracketSide;
	gamesA: number;
	gamesB: number;
	/** Games neither side won. */
	draws: number;
	table: number | null;
	/** Null for a draw, or a match with no result. */
	winner: 'a' | 'b' | null;
};

export type BracketRound = { number: number; name: string; matches: BracketMatch[] };

export type Bracket = {
	rounds: BracketRound[];
	/** How many players the playoff began with: 4 for a top 4. */
	cut: number;
	/** The winner of the last round, when it was one match with a result. */
	champion: BracketSide | null;
	/** Whether each round has half the matches of the one before, so lines can join them. */
	joined: boolean;
};

const sideOf = (standing: StandingView): BracketSide => ({
	playerId: standing.playerId,
	name: standing.name,
	rank: standing.rank,
	record: { wins: standing.wins, losses: standing.losses, draws: standing.draws },
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
	const playoff = event.rounds.filter((round) => isPlayoffRound(round.name));
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
			return [
				{
					a,
					b,
					gamesA: match.gamesA,
					gamesB: match.gamesB,
					draws: match.draws,
					table: match.table,
					winner: winnerOf(match)
				}
			];
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
	const first = rounds[0];
	return {
		rounds,
		cut: new Set(first.matches.flatMap((m) => [m.a.playerId, m.b.playerId])).size,
		champion: final?.winner ? final[final.winner === 'a' ? 'a' : 'b'] : null,
		joined: rounds.every(
			(round, i) => i === 0 || round.matches.length * 2 === rounds[i - 1].matches.length
		)
	};
}

/** Finish groups, by the best rank each takes in: 1st, 2nd, then the top 4, 8 and 16. */
const FINISHES = [
	{ upTo: 1, label: 'Champion' },
	{ upTo: 2, label: 'Finalist' },
	{ upTo: 4, label: 'Top 4' },
	{ upTo: 8, label: 'Top 8' },
	{ upTo: 16, label: 'Top 16' }
] as const;

export type Placement = { label: string; players: BracketSide[] };

/**
 * Who finished where, as a bracket reader asks it: the champion, the finalist, the rest of the top 4,
 * and on, as far as the playoff reached (`cut` players). By final rank, so a player the bracket draws
 * far from the final still has their place. Groups with nobody in them are left out.
 */
export function placements(standings: readonly StandingView[], cut: number): Placement[] {
	let from = 1;
	return FINISHES.flatMap(({ upTo, label }) => {
		const lowest = from;
		from = upTo + 1;
		if (lowest > cut) return [];
		const players = standings
			.filter((s) => s.rank >= lowest && s.rank <= upTo)
			.sort((a, b) => a.rank - b.rank)
			.map(sideOf);
		return players.length > 0 ? [{ label, players }] : [];
	});
}
