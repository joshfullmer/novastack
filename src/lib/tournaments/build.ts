/**
 * Melee's responses → the rows `pnpm melee` writes — `docs/spec/tournaments.md` §3, §4.1.
 *
 * Pure: everything it needs is passed in, so it is tested against captured responses with no
 * network. The rows are typed as the tables' own insert shapes, so a column that moves breaks the
 * build here rather than at a `wrangler d1 execute`.
 *
 * It reads and shapes; it does not judge. `checkTournament` (assertions.ts) is what decides a
 * Tournament is fit to write.
 */
import type { Card } from '../cards/schema.ts';
import type {
	players,
	standings,
	tournamentDeckCards,
	tournamentDecks,
	tournamentMatches,
	tournamentRounds,
	tournaments
} from '../server/db/schema.ts';
import { formatIdOf, indexDeck, pickDecklist } from './decks.ts';
import type { MeleeRound, TournamentInfo } from './html.ts';
import type { MeleeDetails, MeleeMatch, MeleeStanding } from './sources.ts';

export type BuildInput = {
	details: MeleeDetails;
	/** The tournament page's header. */
	info: TournamentInfo;
	rounds: readonly MeleeRound[];
	/** The final round's standings, every page. */
	standings: readonly MeleeStanding[];
	/** Every round's matches. */
	matches: readonly MeleeMatch[];
	/**
	 * Decklist text by guid, from `parseDecklistPage`. Every deck a Standing points at must be here.
	 */
	deckTexts: ReadonlyMap<string, string>;
	/**
	 * Guids from `GetPlayerDetails`, by player, **only** for Standings whose own `Decklists` is empty
	 * (swubase's fallback). In the event measured the one such player had none.
	 */
	fallbackDecklists?: ReadonlyMap<number, readonly string[]>;
	cards: readonly Card[];
};

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export type BuiltTournament = {
	tournament: Row<typeof tournaments>;
	rounds: Row<typeof tournamentRounds>[];
	players: Row<typeof players>[];
	decks: Row<typeof tournamentDecks>[];
	deckCards: Row<typeof tournamentDeckCards>[];
	standings: Row<typeof standings>[];
	matches: Row<typeof tournamentMatches>[];
	/** Things worth saying that aren't errors — read by the CLI, not written. */
	notes: {
		/** Players Melee ranks but who played nothing (`0-0-0`); dropped from `standings`, ranks kept. */
		zeroRecordPlayers: number[];
		/** Matches without a result yet; not written. */
		unplayedMatches: number;
		/** Lists a player registered but left empty; treated as no deck. */
		blankDecks: string[];
		/** Per deck: how it read. See `reviewDecks`. */
		deckReadings: { guid: string; legends: number; mainCards: number; unresolved: number }[];
	};
};

/** `Username` Melee gives an account nobody has claimed — it identifies no one. */
const PLACEHOLDER_USERNAME = '__placeholder__';

const BYE = /was assigned a bye$/;
const DRAW = / Draw$/;
const FORFEIT = /forfeited/;

/**
 * How a match ended, from the two things Melee gives us. The prose is used **only to classify** it:
 * never to find a winner, because a player may be named `Dude won the Potato`. Winners come from the
 * competitors' `GameWins`. Byes and forfeits are unseen in the event measured; their strings are
 * swubase's.
 */
export function matchKind(match: MeleeMatch): 'played' | 'draw' | 'bye' | 'forfeit' | null {
	const result = match.ResultString ?? '';
	if (match.Competitors.length === 1 || BYE.test(result)) return 'bye';
	if (match.Competitors.length === 0 || !match.HasResult) return null;
	if (DRAW.test(result)) return 'draw';
	if (FORFEIT.test(result)) return 'forfeit';
	return 'played';
}

export function buildTournament(input: BuildInput): BuiltTournament {
	const { details, rounds, cards } = input;
	const tournamentId = details.ID;

	const numberByRoundId = new Map(rounds.map((round) => [round.meleeRoundId, round.number]));

	const formatId = formatIdOf(input.standings);

	// Melee ranks players who never played; they have no record and no place in the results.
	const zeroRecordPlayers: number[] = [];
	const ranked = input.standings.filter((standing) => {
		const played = standing.MatchWins + standing.MatchLosses + standing.MatchDraws;
		if (played === 0) zeroRecordPlayers.push(standing.Team.Players[0].ID);
		return played > 0;
	});

	const playerRows = new Map<number, Row<typeof players>>();
	const addPlayer = (player: { ID: number; DisplayName: string; Username: string }) =>
		playerRows.set(player.ID, {
			id: player.ID,
			displayName: player.DisplayName,
			username: player.Username === PLACEHOLDER_USERNAME ? null : player.Username
		});

	const decks: Row<typeof tournamentDecks>[] = [];
	const deckCards: Row<typeof tournamentDeckCards>[] = [];
	const deckReadings: BuiltTournament['notes']['deckReadings'] = [];
	const blankDecks: string[] = [];
	const standingRows: Row<typeof standings>[] = [];

	for (const standing of ranked) {
		const player = standing.Team.Players[0];
		addPlayer(player);

		let deckGuid: string | null = null;
		const picked = pickDecklist(standing, formatId, input.fallbackDecklists?.get(player.ID));
		if (picked) {
			const text = input.deckTexts.get(picked.guid);
			if (text === undefined) throw new Error(`No decklist page was read for ${picked.guid}.`);
			if (text.trim() === '') {
				// A player can register a list and leave it empty. That is no deck: a Tournament Deck
				// that names no card would only skew every count taken over decks.
				blankDecks.push(picked.guid);
			} else {
				const index = indexDeck(picked.guid, text, cards);
				decks.push({
					guid: picked.guid,
					tournamentId,
					playerId: player.ID,
					name: picked.name,
					text,
					legendLine: index.legendLine,
					unresolved: index.unresolved
				});
				deckCards.push(...index.cards);
				deckReadings.push({ guid: picked.guid, ...index.reading });
				deckGuid = picked.guid;
			}
		}

		standingRows.push({
			tournamentId,
			playerId: player.ID,
			rank: standing.Rank,
			points: standing.Points,
			matchWins: standing.MatchWins,
			matchLosses: standing.MatchLosses,
			matchDraws: standing.MatchDraws,
			gameWins: standing.GameWins,
			gameLosses: standing.GameLosses,
			gameDraws: standing.GameDraws,
			deckGuid
		});
	}

	const matchRows: Row<typeof tournamentMatches>[] = [];
	let unplayedMatches = 0;
	for (const match of input.matches) {
		const kind = matchKind(match);
		if (kind === null) {
			if (match.Competitors.length > 0) unplayedMatches += 1;
			continue;
		}
		const round = numberByRoundId.get(match.RoundId);
		if (round === undefined)
			throw new Error(`A match is in round ${match.RoundId}, which the page doesn't list.`);

		const [a, b] = match.Competitors;
		addPlayer(a.Team.Players[0]);
		if (b) addPlayer(b.Team.Players[0]);
		matchRows.push({
			tournamentId,
			round,
			tableNumber: match.TableNumber,
			playerA: a.Team.Players[0].ID,
			playerB: b ? b.Team.Players[0].ID : null,
			gamesA: a.GameWins,
			gamesB: b ? b.GameWins : 0,
			draws: match.GameDraws,
			kind
		});
	}

	return {
		tournament: {
			id: tournamentId,
			name: details.Name,
			startsAt: new Date(details.StartDate),
			organizerId: details.OrganizationId,
			organizerName: details.OrganizationName,
			format: details.Format,
			formatId,
			playerCount: details.ParticipatorCount,
			venue: input.info.venue,
			tournamentType: input.info.tournamentType,
			entryFee: input.info.entryFee,
			registration: input.info.registration,
			capacity: input.info.capacity
		},
		rounds: rounds.map((round) => ({
			tournamentId,
			number: round.number,
			meleeRoundId: round.meleeRoundId,
			name: round.name
		})),
		players: [...playerRows.values()],
		decks,
		deckCards,
		standings: standingRows,
		matches: matchRows,
		notes: { zeroRecordPlayers, unplayedMatches, deckReadings, blankDecks }
	};
}
