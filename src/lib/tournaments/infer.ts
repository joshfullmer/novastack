/**
 * The final standings of an event whose organizer never published them — `docs/spec/tournaments.md` §4.1.
 *
 * Melee ranks a top cut by how far each player got, and records every playoff match in the players'
 * match and game records, but adds nothing to their points. When the standings are published up to some
 * round and the playoff rounds after it never were, all of that follows from those rounds' matches, so
 * the final standings can be written without guessing: the players still in the bracket take, between
 * them, the ranks they already held, in order of how far they got (a champion, a finalist, then each
 * earlier round's losers in the order they already stood). Everyone else keeps their published row. The
 * rule is checked against events whose final standings *are* published (`infer.spec.ts`).
 *
 * It declines, and says why, whenever the playoff isn't a clean single-elimination bracket: a drawn
 * or forfeited match, a bye, a round that isn't finished, a player in a round who didn't win the one
 * before, or a last round that isn't one final. Declining is the point; an unknown ranking is
 * refused, not estimated.
 */
import { matchKind } from './build.ts';
import type { MeleeMatch, MeleeStanding } from './sources.ts';

type Standing = Pick<
	MeleeStanding,
	'Rank' | 'MatchWins' | 'MatchLosses' | 'GameWins' | 'GameLosses' | 'GameDraws' | 'Team'
>;

export type PlayoffRound = { name: string; matches: readonly MeleeMatch[] };

export type Inferred<S extends Standing> =
	{ ok: true; standings: S[]; summary: string } | { ok: false; reason: string };

const idOf = (standing: Standing) => standing.Team.Players[0].ID;

export function inferFinalStandings<S extends Standing>(
	/** The last published standings (after a Swiss round or a playoff round), every player. */
	published: readonly S[],
	/** The playoff rounds after it that have results, in the order they were played. */
	playoff: readonly PlayoffRound[]
): Inferred<S> {
	const no = (reason: string): Inferred<S> => ({ ok: false, reason });
	if (playoff.length === 0) return no('there is no playoff to read a ranking from');

	const rankOf = new Map(published.map((row) => [idOf(row), row.Rank]));
	const known = (id: number) => rankOf.has(id);

	// The bracket: who beat whom, round by round.
	const eliminatedAt: number[][] = [];
	const results: {
		winner: number;
		loser: number;
		winnerGames: number;
		loserGames: number;
		draws: number;
	}[] = [];
	let alive: Set<number> | null = null;
	let entrants: number[] = [];
	for (const [index, round] of playoff.entries()) {
		const survivors = new Set<number>();
		const out: number[] = [];
		const seen: number[] = [];
		for (const match of round.matches) {
			const kind = matchKind(match);
			if (kind === null) return no(`${round.name} isn't finished`);
			if (kind !== 'played') {
				return no(`${round.name} has a ${kind}, so who advanced isn't known`);
			}
			const [a, b] = match.Competitors;
			const [x, y] = [a.Team.Players[0].ID, b.Team.Players[0].ID];
			if (!known(x) || !known(y)) return no(`${round.name} names a player the standings don't`);
			if (alive && !(alive.has(x) && alive.has(y))) {
				return no(
					`${round.name} has a player who didn't win the round before, so it isn't a plain bracket`
				);
			}
			if (a.GameWins === b.GameWins) return no(`${round.name} has a match with no winner`);
			const [win, lose] = a.GameWins > b.GameWins ? [a, b] : [b, a];
			const [winner, loser] = [win.Team.Players[0].ID, lose.Team.Players[0].ID];
			survivors.add(winner);
			out.push(loser);
			seen.push(winner, loser);
			results.push({
				winner,
				loser,
				winnerGames: win.GameWins,
				loserGames: lose.GameWins,
				draws: match.GameDraws
			});
		}
		if (alive && survivors.size * 2 !== alive.size) {
			return no(`${round.name} doesn't halve the field, so it isn't a plain bracket`);
		}
		if (index === 0) entrants = seen;
		eliminatedAt[index] = out;
		alive = survivors;
	}
	if (!alive || alive.size !== 1) return no('the last round is not a single final');
	const [champion] = [...alive];

	// The entrants hold some ranks between them; the bracket decides who gets which. They must be a
	// block of consecutive ranks, or "the ranks they already held" would put someone outside the
	// bracket between them, and nothing says how Melee orders that.
	const slots = entrants.map((id) => rankOf.get(id) ?? 0).toSorted((p, q) => p - q);
	if (slots.some((rank, i) => i > 0 && rank !== slots[i - 1] + 1)) {
		return no(`the players in ${playoff[0].name} don't hold consecutive ranks`);
	}
	const standing = (ids: readonly number[]) =>
		[...ids].toSorted((p, q) => (rankOf.get(p) ?? 0) - (rankOf.get(q) ?? 0));
	const order = [champion, ...eliminatedAt.toReversed().flatMap(standing)];
	const newRank = new Map(order.map((id, i) => [id, slots[i]]));

	const tally = new Map<number, { w: number; l: number; gw: number; gl: number; gd: number }>();
	const of = (id: number) => {
		const found = tally.get(id) ?? { w: 0, l: 0, gw: 0, gl: 0, gd: 0 };
		tally.set(id, found);
		return found;
	};
	for (const r of results) {
		const win = of(r.winner);
		const lose = of(r.loser);
		win.w += 1;
		lose.l += 1;
		win.gw += r.winnerGames;
		win.gl += r.loserGames;
		lose.gw += r.loserGames;
		lose.gl += r.winnerGames;
		win.gd += r.draws;
		lose.gd += r.draws;
	}

	const standings = published
		.map((row) => {
			const add = tally.get(idOf(row));
			if (!add) return row;
			return {
				...row,
				Rank: newRank.get(idOf(row)) ?? row.Rank,
				MatchWins: row.MatchWins + add.w,
				MatchLosses: row.MatchLosses + add.l,
				GameWins: row.GameWins + add.gw,
				GameLosses: row.GameLosses + add.gl,
				GameDraws: row.GameDraws + add.gd
			};
		})
		.toSorted((p, q) => p.Rank - q.Rank);
	return {
		ok: true,
		standings,
		summary: `${playoff.map((round) => round.name).join(', ')} ${playoff.length === 1 ? 'was' : 'were'} played but Melee never published standings for ${playoff.length === 1 ? 'it' : 'them'}, so the final ranking is read from the bracket (${entrants.length} players in it).`
	};
}
