/**
 * One Melee tournament id → a `BuiltTournament`, over the network — `docs/spec/tournaments.md` §4.1.
 *
 * ```
 * details ─ not Ended? refuse
 *   → View (rounds) → final standings (unpublished? the last round that has them, if nothing after it was played)
 *   → [GetPlayerDetails × standings with no list]
 *   → matches × rounds → Decklist/View × decks ─ none readable? refuse → build → check
 * ```
 *
 * Reads and decides; never writes. The CLI writes what this returns.
 */
import type { Card } from '../cards/schema.ts';
import { checkTournament, reviewDecks } from './assertions.ts';
import { buildTournament, matchKind, type BuiltTournament } from './build.ts';
import { dataTablesBody, type MeleeClient } from './client.ts';
import { formatIdOf, pickDecklist } from './decks.ts';
import { parseDecklistPage, parseTournamentView, type MeleeRound } from './html.ts';
import { inferFinalStandings } from './infer.ts';
import { isPlayoffRound } from './rounds.ts';
import {
	MeleeDetailsSchema,
	MeleeMatchesPageSchema,
	MeleePlayerDetailsSchema,
	MeleeStandingsPageSchema,
	type MeleeMatch,
	type MeleeStanding
} from './sources.ts';

/** Not an error in Melee or in us: the event isn't ready to be written. The message says what to do. */
export class Refusal extends Error {
	/** Melee's name for the event, once known, so a remembered refusal is readable. */
	readonly eventName: string | null;

	// No parameter property: `node` strips types but doesn't compile them (`scripts/melee.ts`).
	constructor(message: string, eventName: string | null = null) {
		super(message);
		this.name = 'Refusal';
		this.eventName = eventName;
	}
}

/**
 * An event Melee's own format says has no constructed lists to read, so nothing else is fetched for it.
 * Measured: none of 24 Sealed events had a single list on its standings. Other formats still ingest
 * whenever they have lists; only this one is turned away on the format alone.
 */
const FORMATS_WITHOUT_LISTS: ReadonlySet<string> = new Set(['Sealed']);

export class SkipEvent extends Error {
	/** Melee's name for the event and its format, so what was skipped is readable. */
	readonly eventName: string | null;
	readonly format: string;

	// No parameter property: `node` strips types but doesn't compile them (`scripts/melee.ts`).
	constructor(message: string, eventName: string | null, format: string) {
		super(message);
		this.name = 'SkipEvent';
		this.eventName = eventName;
		this.format = format;
	}
}

const PAGE = 500;
const STANDINGS_COLUMNS = [
	'Rank',
	'Player',
	'Decklists',
	'MatchRecord',
	'GameRecord',
	'Points',
	'OpponentMatchWinPercentage',
	'TeamGameWinPercentage',
	'OpponentGameWinPercentage',
	'FinalTiebreaker',
	'OpponentCount'
];
const MATCH_COLUMNS = ['TableNumber', 'PodNumber', 'Teams', 'Decklists', 'ResultString'];

/** Every row of a DataTables endpoint, paged. Fewer rows than it said exist is a failure, not a result. */
async function allRows<T>(
	page: (start: number) => Promise<{ recordsTotal: number; data: T[] }>,
	what: string
): Promise<T[]> {
	const rows: T[] = [];
	let total = Infinity;
	while (rows.length < total) {
		const { recordsTotal, data } = await page(rows.length);
		total = recordsTotal;
		if (data.length === 0 && rows.length < total) {
			throw new Error(`${what}: Melee reports ${total} rows but returned only ${rows.length}.`);
		}
		rows.push(...data);
	}
	return rows;
}

export type IngestOptions = {
	cards: readonly Card[];
	log?: (line: string) => void;
};

export type Ingested = {
	built: BuiltTournament;
	/** The standings as Melee sent them, which `checkTournament` compares against. */
	rawStandings: MeleeStanding[];
	/** Violations are fatal; findings are only worth reading. */
	violations: string[];
	findings: string[];
};

export async function ingestTournament(
	client: MeleeClient,
	id: number,
	options: IngestOptions
): Promise<Ingested> {
	const log = options.log ?? (() => {});

	const details = await client.json(
		`/Tournament/GetTournamentDetails?id=${id}`,
		MeleeDetailsSchema
	);
	if (details.ID !== id)
		throw new Error(`Asked for tournament ${id}, Melee answered ${details.ID}.`);
	// Before anything else is fetched: for these events this one request is all the run costs.
	if (FORMATS_WITHOUT_LISTS.has(details.Format)) {
		throw new SkipEvent(
			`${id} is a ${details.Format} event, which has no decklists to read, so it is skipped for good.`,
			details.Name,
			details.Format
		);
	}
	if (details.Status !== 'Ended') {
		throw new Refusal(
			`${id} is "${details.Status}", not Ended. Try again when it's over.`,
			details.Name
		);
	}

	const view = parseTournamentView(await client.text(`/Tournament/View/${id}`), id);
	log(`${view.rounds.length} rounds`);

	const standingsOf = (round: MeleeRound | number) =>
		allRows(
			async (start) =>
				client.form(
					'/Standing/GetRoundStandings',
					dataTablesBody(STANDINGS_COLUMNS, start, PAGE, {
						roundId: String(typeof round === 'number' ? round : round.meleeRoundId)
					}),
					MeleeStandingsPageSchema
				),
			'standings'
		);
	// Remembered by round: looking at a round to decide something must not cost a second request later.
	const fetched = new Map<number, Promise<MeleeMatch[]>>();
	const matchesOf = (round: MeleeRound) => {
		const known = fetched.get(round.meleeRoundId);
		if (known) return known;
		const asked = allRows(
			async (start) =>
				client.form(
					`/Match/GetRoundMatches/${round.meleeRoundId}`,
					dataTablesBody(MATCH_COLUMNS, start, PAGE),
					MeleeMatchesPageSchema
				),
			`round ${round.number} matches`
		);
		fetched.set(round.meleeRoundId, asked);
		return asked;
	};

	let standings = await standingsOf(view.finalStandingsRoundId);
	let rounds = view.rounds;
	const extra: string[] = [];
	if (standings.length === 0) {
		// Organizers often create more rounds than they run, leaving the rest empty. When nothing was
		// played after the last round that has standings, those are the final results: no guess, just
		// the last round that happened. If a later round *has* results, the ranking is genuinely unknown.
		const unpublished = rounds.findIndex(
			(round) => round.meleeRoundId === view.finalStandingsRoundId
		);
		let last = -1;
		for (let i = unpublished - 1; i >= 0 && last === -1; i--) {
			const found = await standingsOf(rounds[i]);
			if (found.length > 0) {
				standings = found;
				last = i;
			}
		}
		if (last === -1) {
			throw new Refusal(
				`Melee has no standings for the last round (${rounds.at(-1)?.name ?? 'unknown'}): the ` +
					`organizer hasn't published them, so there are no final results to read.`,
				details.Name
			);
		}
		const skipped = rounds.slice(last + 1);
		const hasResults: boolean[] = [];
		for (const round of skipped) {
			hasResults.push((await matchesOf(round)).some((match) => matchKind(match) !== null));
		}
		const lastPlayed = hasResults.lastIndexOf(true);
		const unreadable = (round: string, why: string) =>
			new Refusal(
				`${round} has results but Melee has no standings for it, and the final ranking can't be ` +
					`read from them (${why}). Try again once the organizer publishes them.`,
				details.Name
			);
		if (lastPlayed === -1) {
			rounds = rounds.slice(0, last + 1);
			extra.push(
				`${skipped.map((round) => round.name).join(', ')} ${skipped.length === 1 ? 'has' : 'have'} no results on Melee, ` +
					`so the final standings are those after ${rounds[last].name}.`
			);
		} else {
			// A playoff that was played but never ranked: the bracket says who got how far, so the
			// ranking follows (`infer.ts`), for a clean single-elimination bracket only.
			const played = skipped.slice(0, lastPlayed + 1);
			const first = played[0].name;
			const gap = played.find((round, i) => !hasResults[i] || !isPlayoffRound(round.name));
			if (gap) {
				throw unreadable(
					gap.name,
					hasResults[played.indexOf(gap)]
						? 'it is not a playoff round'
						: 'it has no results but a later round does'
				);
			}
			const inferred = inferFinalStandings(
				standings,
				await Promise.all(
					played.map(async (round) => ({ name: round.name, matches: await matchesOf(round) }))
				)
			);
			if (!inferred.ok) throw unreadable(first, inferred.reason);
			standings = inferred.standings;
			rounds = rounds.slice(0, last + 1 + played.length);
			extra.push(inferred.summary);
			const dropped = skipped.slice(played.length);
			if (dropped.length > 0) {
				extra.push(
					`${dropped.map((round) => round.name).join(', ')} had no results and are left out.`
				);
			}
		}
	}
	const formatId = formatIdOf(standings);
	log(`${standings.length} standings`);

	// swubase's fallback: a final standing can show no list for a player who has one, so ask Melee
	// about that player directly. In the event measured the one such player genuinely had none.
	const fallbackDecklists = new Map<number, string[]>();
	for (const standing of standings) {
		if (standing.Decklists.some((list) => list.FormatId === formatId)) continue;
		const player = standing.Team.Players[0];
		const found = await client.json(
			`/Player/GetPlayerDetails?id=${player.ID}`,
			MeleePlayerDetailsSchema
		);
		if (found.decklists.length > 0) fallbackDecklists.set(player.ID, found.decklists);
	}

	const matches = [];
	for (const round of rounds) matches.push(...(await matchesOf(round)));
	log(`${matches.length} matches`);

	const deckTexts = new Map<string, string>();
	for (const standing of standings) {
		const picked = pickDecklist(
			standing,
			formatId,
			fallbackDecklists.get(standing.Team.Players[0].ID)
		);
		if (!picked || deckTexts.has(picked.guid)) continue;
		deckTexts.set(
			picked.guid,
			parseDecklistPage(await client.text(`/Decklist/View/${picked.guid}`), picked.guid)
		);
	}
	// A Tournament without decklists isn't worth keeping: decks are what every page is built around.
	// Lists can appear after an event ends, so this is "not yet", and rerunning later is the retry.
	if (![...deckTexts.values()].some((text) => text.trim() !== '')) {
		throw new Refusal(
			`${id} has no decklists (none of its ${standings.length} players has one up), so it isn't ingested. ` +
				`Lists can appear after an event ends; try again later.`,
			details.Name
		);
	}
	log(`${deckTexts.size} decklists`);

	const built = buildTournament({
		details,
		info: view.info,
		rounds,
		standings,
		matches,
		deckTexts,
		fallbackDecklists,
		cards: options.cards
	});
	return {
		built,
		rawStandings: standings,
		violations: checkTournament(built, standings),
		findings: [
			...extra,
			...reviewDecks(built),
			...built.notes.blankDecks.map(
				(guid) => `${guid}: registered a blank list; treated as no deck.`
			),
			...(Object.values(view.info).every((value) => value === null)
				? [
						'The tournament page header could not be read: venue, type, fee, registration and capacity are all empty.'
					]
				: [])
		]
	};
}
