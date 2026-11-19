/**
 * Is this Tournament fit to write? — `docs/spec/tournaments.md` §4.2.
 *
 * Violations are returned, not thrown, so a run can say all of them at once. A Tournament with any
 * is not written (exit 2). `reviewDecks` is different: it reports what looks wrong with a *reading*
 * of a deck and never blocks, because a Card we haven't ingested yet must not stop an event.
 */
import type { BuiltTournament } from './build.ts';
import { isPlayoffRound } from './rounds.ts';
import type { MeleeStanding } from './sources.ts';

const MAIN_DECK = { min: 40, max: 50 } as const;

type Tally = { wins: number; losses: number; draws: number };

/**
 * Each player's match record as the match rows tell it, to compare against the standings row. A
 * player who has a forfeit is left out: who forfeited isn't recorded in anything we keep, so their
 * record can't be recomputed and must not be guessed.
 */
export function recordsFromMatches(
	matches: BuiltTournament['matches'],
	/** Round numbers of the playoff, where a drawn match is not a draw (below). */
	playoff: ReadonlySet<number> = new Set()
): Map<number, Tally> {
	const records = new Map<number, Tally>();
	const skip = new Set<number>();
	const of = (id: number) => {
		const existing = records.get(id);
		if (existing) return existing;
		const created = { wins: 0, losses: 0, draws: 0 };
		records.set(id, created);
		return created;
	};
	for (const match of matches) {
		// A nullable column is optional in an insert row, so "no opponent" is null or absent.
		const { playerA: a } = match;
		const b = match.playerB ?? null;
		if (match.kind === 'forfeit') {
			skip.add(a);
			if (b !== null) skip.add(b);
		} else if (match.kind === 'bye') {
			of(a).wins += 1;
		} else if (b !== null) {
			const draw = match.kind === 'draw' || match.gamesA === match.gamesB;
			if (draw && playoff.has(match.round)) {
				// An elimination match can't end level, so Melee's records count it a loss for both
				// players, while still adding its drawn games (the 470955 final: 0-0-3 "Draw", and
				// each finalist's record gained a loss, not a draw).
				of(a).losses += 1;
				of(b).losses += 1;
			} else if (draw) {
				of(a).draws += 1;
				of(b).draws += 1;
			} else if (match.gamesA > match.gamesB) {
				of(a).wins += 1;
				of(b).losses += 1;
			} else {
				of(b).wins += 1;
				of(a).losses += 1;
			}
		}
	}
	for (const id of skip) records.delete(id);
	return records;
}

export function checkTournament(
	built: BuiltTournament,
	/** The standings as Melee sent them, before any were dropped. */
	raw: readonly MeleeStanding[]
): string[] {
	const violations: string[] = [];
	const add = (message: string) => violations.push(message);

	// A count Melee gave and a count we hold must agree, or something was dropped or doubled.
	const expected = built.tournament.playerCount;
	const held = built.standings.length + built.notes.zeroRecordPlayers.length;
	if (held !== expected)
		add(
			`${held} players in the standings (counting ${built.notes.zeroRecordPlayers.length} who played nothing), but Melee says ${expected}.`
		);
	if (raw.length !== held) add(`${raw.length} standings rows were read but ${held} were built.`);

	for (const standing of raw) {
		const total = standing.GameWins + standing.GameLosses + standing.GameDraws;
		// `GameCount` is the Swiss phase's. A top cut's final standings are cumulative, so the record
		// can exceed it (477190: 9-2-3 against a count of 9), but never fall short of it.
		if (total < standing.GameCount) {
			add(
				`${standing.Team.Players[0].DisplayName}: game record ${total} is fewer than the ${standing.GameCount} games Melee counted.`
			);
		}
	}

	const unique = (label: string, keys: readonly string[]) => {
		const seen = new Set<string>();
		for (const key of keys) {
			if (seen.has(key)) add(`Duplicate ${label}: ${key}.`);
			seen.add(key);
		}
	};
	unique(
		'standing',
		built.standings.map((row) => String(row.playerId))
	);
	unique(
		'deck',
		built.decks.map((row) => row.guid)
	);
	unique(
		'deck card',
		built.deckCards.map((row) => `${row.deckGuid}/${row.cardSlug}/${row.board}`)
	);
	unique(
		'round',
		built.rounds.map((row) => String(row.number))
	);

	const numbers = built.rounds.map((round) => round.number).sort((x, y) => x - y);
	if (numbers.some((number, index) => number !== index + 1))
		add(`Rounds aren't numbered 1..${numbers.length} without gaps.`);

	const deckGuids = new Set(built.decks.map((deck) => deck.guid));
	for (const row of built.standings) {
		if (row.deckGuid !== null && row.deckGuid !== undefined && !deckGuids.has(row.deckGuid)) {
			add(`Standing ${row.playerId} points at deck ${row.deckGuid}, which wasn't read.`);
		}
	}

	const standingIds = new Set(built.standings.map((row) => row.playerId));
	const roundNumbers = new Set(built.rounds.map((round) => round.number));
	for (const match of built.matches) {
		for (const id of [match.playerA, match.playerB]) {
			if (id !== null && id !== undefined && !standingIds.has(id))
				add(`A round ${match.round} match names player ${id}, who has no standing.`);
		}
		if (!roundNumbers.has(match.round))
			add(`A match is in round ${match.round}, which isn't listed.`);
	}

	// The strongest check we have: the results table and the matches table are two separate Melee
	// endpoints, and they must tell the same story.
	const playoff = new Set(
		built.rounds.filter((round) => isPlayoffRound(round.name)).map((round) => round.number)
	);
	const fromMatches = recordsFromMatches(built.matches, playoff);
	for (const row of built.standings) {
		const computed = fromMatches.get(row.playerId);
		if (!computed) continue;
		if (
			computed.wins !== row.matchWins ||
			computed.losses !== row.matchLosses ||
			computed.draws !== row.matchDraws
		) {
			add(
				`Player ${row.playerId}: standings say ${row.matchWins}-${row.matchLosses}-${row.matchDraws} but ` +
					`the matches add up to ${computed.wins}-${computed.losses}-${computed.draws}.`
			);
		}
	}

	return violations;
}

/**
 * What looks wrong with how a deck read. **Never blocks** (spec §3.2): reported so a person can look,
 * and so a spike in `unresolved` after a card-data change is visible rather than silent.
 */
export function reviewDecks(built: BuiltTournament): string[] {
	const findings: string[] = [];
	for (const deck of built.notes.deckReadings) {
		if (deck.legends !== 3) findings.push(`${deck.guid}: ${deck.legends} Legends, not 3.`);
		if (deck.mainCards < MAIN_DECK.min || deck.mainCards > MAIN_DECK.max) {
			findings.push(
				`${deck.guid}: ${deck.mainCards} main-deck cards, outside ${MAIN_DECK.min}–${MAIN_DECK.max}.`
			);
		}
		if (deck.unresolved > 0)
			findings.push(`${deck.guid}: ${deck.unresolved} lines named no single Card.`);
	}
	return findings;
}
