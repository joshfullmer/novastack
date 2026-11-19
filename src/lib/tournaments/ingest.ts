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
import {
	MeleeDetailsSchema,
	MeleeMatchesPageSchema,
	MeleePlayerDetailsSchema,
	MeleeStandingsPageSchema,
	type MeleeStanding
} from './sources.ts';

/** Not an error in Melee or in us: the event isn't ready to be written. The message says what to do. */
export class Refusal extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'Refusal';
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
	if (details.Status !== 'Ended') {
		throw new Refusal(`${id} is "${details.Status}", not Ended. Try again when it's over.`);
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
	const matchesOf = (round: MeleeRound) =>
		allRows(
			async (start) =>
				client.form(
					`/Match/GetRoundMatches/${round.meleeRoundId}`,
					dataTablesBody(MATCH_COLUMNS, start, PAGE),
					MeleeMatchesPageSchema
				),
			`round ${round.number} matches`
		);

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
					`organizer hasn't published them, so there are no final results to read.`
			);
		}
		const skipped = rounds.slice(last + 1);
		for (const round of skipped) {
			if ((await matchesOf(round)).some((match) => matchKind(match) !== null)) {
				throw new Refusal(
					`${round.name} has results but Melee has no standings for it, so the final ranking isn't ` +
						`known. Try again once the organizer publishes them.`
				);
			}
		}
		rounds = rounds.slice(0, last + 1);
		extra.push(
			`${skipped.map((round) => round.name).join(', ')} ${skipped.length === 1 ? 'has' : 'have'} no results on Melee, ` +
				`so the final standings are those after ${rounds[last].name}.`
		);
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
				`Lists can appear after an event ends; try again later.`
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
