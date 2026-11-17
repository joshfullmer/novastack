/**
 * The ingest's reading of Melee, against the responses captured from tournament 485070 (a 14-player,
 * 4-round Swiss Constructed event, 2026-11-16) — `fixtures/`. Where that event can't show a case
 * (a bye, a forfeit, a top cut, a stale cookie) the test says **synthetic**: the strings come from
 * swubase's handling of Melee, not from a Cyberpunk event, and are the thing to re-check against a
 * real one.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'node-html-parser';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { dataset } from '../cards/index.ts';
import { checkTournament, recordsFromMatches, reviewDecks } from './assertions.ts';
import { buildTournament, matchKind, type BuildInput } from './build.ts';
import {
	MeleeSignInError,
	parseDecklistPage,
	parseTournamentInfo,
	parseTournamentView
} from './html.ts';
import {
	MeleeDetailsSchema,
	MeleeMatchSchema,
	MeleeMatchesPageSchema,
	MeleePlayerDetailsSchema,
	MeleeStandingSchema,
	MeleeStandingsPageSchema
} from './sources.ts';

const ID = 485070;
const TENTACLE_DECK = '7d108679-b55c-4994-8880-b5010014112d';

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const json = (name: string): unknown => JSON.parse(read(name));

const details = v.parse(MeleeDetailsSchema, json('details.json'));
const view = parseTournamentView(read('view-rounds.html'), ID);
const standings = v.parse(MeleeStandingsPageSchema, json('standings-final.json')).data;
const matches = [1, 2, 3, 4].flatMap(
	(n) => v.parse(MeleeMatchesPageSchema, json(`matches-round-${n}.json`)).data
);
const deckText = parseDecklistPage(read('decklist-view.html'), TENTACLE_DECK);

/** Only the winner's deck page was captured, so everyone else is built as having registered none. */
const onlyWinnerHasADeck = standings.map((standing) =>
	standing.Rank === 1 ? standing : { ...standing, Decklists: [] }
);

const input = (overrides: Partial<BuildInput> = {}): BuildInput => ({
	details,
	info: view.info,
	rounds: view.rounds,
	standings: onlyWinnerHasADeck,
	matches,
	deckTexts: new Map([[TENTACLE_DECK, deckText]]),
	cards: dataset.cards,
	...overrides
});

/** A match row as Melee shapes it, for the cases the captured event doesn't contain. */
const match = (overrides: Record<string, unknown>) =>
	v.parse(MeleeMatchSchema, {
		Competitors: [
			{
				Team: { Players: [{ ID: 1, DisplayName: 'A', Username: 'a' }] },
				GameWins: 2,
				GameByes: null
			},
			{
				Team: { Players: [{ ID: 2, DisplayName: 'B', Username: 'b' }] },
				GameWins: null,
				GameByes: null
			}
		],
		ResultString: 'A won 2-0-0',
		GameDraws: 0,
		HasResult: true,
		RoundId: 1727271,
		TableNumber: 1,
		...overrides
	});

describe('the Tournament page', () => {
	it('lists the rounds in button order, numbered by position', () => {
		expect(view.rounds.map((round) => [round.number, round.meleeRoundId, round.name])).toEqual([
			[1, 1727271, 'Round 1'],
			[2, 1727272, 'Round 2'],
			[3, 1727273, 'Round 3'],
			[4, 1727274, 'Round 4']
		]);
		expect(view.finalStandingsRoundId).toBe(1727274);
	});

	it('refuses a page that is not the tournament asked for', () => {
		expect(() => parseTournamentView(read('view-rounds.html'), 999)).toThrow(
			/not the tournament page/
		);
	});

	it('names the sign-in page instead of reading it as an empty tournament', () => {
		const signIn =
			'<html><head><title>Sign In to Your Account | Melee</title></head><body></body></html>';
		expect(() => parseTournamentView(signIn, ID)).toThrow(MeleeSignInError);
		expect(() => parseDecklistPage(signIn, 'x')).toThrow(/MELEE_COOKIE/);
	});

	it('synthetic: numbers a top cut by position, not by its name', () => {
		const html = `<input id="tournament-id" value="7" />
			<div id="standings-round-selector-container">
				<button class="round-selector" data-id="11" data-name="Round 1">Round 1</button>
				<button class="round-selector" data-id="12" data-name="Round 2">Round 2</button>
				<button class="round-selector" data-id="13" data-name="Quarterfinals">Quarterfinals</button>
				<button class="round-selector" data-id="14" data-name="Finals">Finals</button>
			</div>`;
		const result = parseTournamentView(html, 7);
		expect(result.rounds.map((round) => [round.number, round.name])).toEqual([
			[1, 'Round 1'],
			[2, 'Round 2'],
			[3, 'Quarterfinals'],
			[4, 'Finals']
		]);
		expect(result.finalStandingsRoundId).toBe(14);
	});
});

describe("the Tournament page's header", () => {
	it('reads Melee’s own metadata for the captured event', () => {
		expect(view.info).toEqual({
			tournamentType: 'Tabletop',
			venue: 'the hungry dragon',
			entryFee: '$20.00 (External to Melee)',
			registration: 'Open Registration',
			capacity: 32
		});
	});

	const info = (html: string) => parseTournamentInfo(parse(html));

	it('reads an invite-only event with a different venue and fee', () => {
		expect(
			info(`<p id="tournament-headline-platform">Tournament Type: Tabletop</p>
				<a data-type="venue" href="#"><i></i> Nexus Entertainment - Tempe</a>
				<p id="tournament-headline-registration">Entry Fee: $30.00 (External to Melee) |
					<i></i>Invite Only | Format: Constructed | <i></i>Ended | <i></i>26 of 32 Enrolled Players</p>`)
		).toEqual({
			tournamentType: 'Tabletop',
			venue: 'Nexus Entertainment - Tempe',
			entryFee: '$30.00 (External to Melee)',
			registration: 'Invite Only',
			capacity: 32
		});
	});

	it('synthetic: an event with no fee or venue leaves those null rather than failing', () => {
		const result = info(`<p id="tournament-headline-platform">Tournament Type: Online</p>
			<p id="tournament-headline-registration">Open Registration | Format: Constructed | Ended | 8 of 16 Enrolled Players</p>`);
		expect(result).toEqual({
			tournamentType: 'Online',
			venue: null,
			entryFee: null,
			registration: 'Open Registration',
			capacity: 16
		});
	});

	it('does not guess the registration mode when it is ambiguous', () => {
		const result = info(
			`<p id="tournament-headline-registration">Open Registration | Waitlist | Format: Constructed | Ended</p>`
		);
		expect(result.registration).toBeNull();
	});

	it('is all null for a page with no header at all', () => {
		expect(info('<div></div>')).toEqual({
			tournamentType: null,
			venue: null,
			entryFee: null,
			registration: null,
			capacity: null
		});
	});
});

describe('the decklist page', () => {
	it('reads the three sections, entity-decoded', () => {
		expect(deckText.startsWith('MainDeck\n')).toBe(true);
		expect(deckText).toContain('\n\nLegends\n');
		expect(deckText).toContain('\n\nSideboard\n');
		expect(deckText).toContain("3 Royce | Don't Call Me Simon");
		expect(deckText).not.toContain('&#39;');
	});

	it('wants exactly one decklist element', () => {
		expect(() => parseDecklistPage('<html><body></body></html>', 'g')).toThrow(/found 0/);
		const two = '<pre id="decklist-text">a</pre><pre id="decklist-text">b</pre>';
		expect(() => parseDecklistPage(two, 'g')).toThrow(/found 2/);
	});
});

describe('the boundary schemas', () => {
	it('read a loser with no game wins as 0, not null', () => {
		const loser = matches.flatMap((m) => m.Competitors).filter((c) => c.GameWins === 0);
		expect(loser.length).toBeGreaterThan(0);
	});

	it('refuse a team of two rather than taking the first player', () => {
		const team = {
			...standings[0],
			Team: { Players: [...standings[0].Team.Players, ...standings[1].Team.Players] }
		};
		expect(() => v.parse(MeleeStandingSchema, team)).toThrow();
	});

	it('read the one GetPlayerDetails seen: a player with no decklist', () => {
		expect(v.parse(MeleePlayerDetailsSchema, json('player-no-decklist.json')).decklists).toEqual(
			[]
		);
	});

	it('synthetic: read a decklist from either of the shapes swubase accepts', () => {
		expect(
			v.parse(MeleePlayerDetailsSchema, { decklists: [{ id: 'g1' }, { DecklistId: 'g2' }] })
				.decklists
		).toEqual(['g1', 'g2']);
		expect(() => v.parse(MeleePlayerDetailsSchema, { decklists: [{ other: 'x' }] })).toThrow();
	});
});

describe('how a match ended', () => {
	it('classifies the captured event: 26 played, 2 drawn, nothing else', () => {
		const kinds = matches.map(matchKind);
		expect(kinds.filter((kind) => kind === 'played')).toHaveLength(26);
		expect(kinds.filter((kind) => kind === 'draw')).toHaveLength(2);
		expect(kinds).toHaveLength(28);
	});

	it('synthetic: a bye, by the sentence or by having one competitor', () => {
		expect(matchKind(match({ ResultString: 'A was assigned a bye' }))).toBe('bye');
		expect(matchKind(match({ Competitors: [match({}).Competitors[0]], ResultString: null }))).toBe(
			'bye'
		);
	});

	it('synthetic: a forfeit, and a match without a result yet', () => {
		expect(matchKind(match({ ResultString: 'B forfeited the match' }))).toBe('forfeit');
		expect(matchKind(match({ HasResult: false, ResultString: null }))).toBeNull();
	});

	it('does not look for a winner in the prose: a player may be named "Dude won the Potato"', () => {
		const potato = match({ ResultString: 'Dude won the Potato won 2-0-0' });
		expect(matchKind(potato)).toBe('played');
		const built = buildTournament(input({ matches: [potato] }));
		expect(built.matches[0]).toMatchObject({ playerA: 1, playerB: 2, gamesA: 2, gamesB: 0 });
	});
});

describe('building the captured tournament', () => {
	const built = buildTournament(input());

	it('describes the Tournament, taking the format id from the standings', () => {
		expect(built.tournament).toMatchObject({
			id: ID,
			name: 'The Hungry Dragon, Cyberpunk TCG: Night City Showdown',
			organizerId: 9735,
			organizerName: 'The_hungry_dragon',
			format: 'Constructed',
			formatId: 'fa955583-31da-48c6-b9d4-e5637d6c4286',
			playerCount: 14
		});
		expect(built.tournament.startsAt).toEqual(new Date('2026-11-16T00:30:00Z'));
	});

	it("writes the page header's fields onto the Tournament", () => {
		expect(built.tournament).toMatchObject({
			venue: 'the hungry dragon',
			tournamentType: 'Tabletop',
			entryFee: '$20.00 (External to Melee)',
			registration: 'Open Registration',
			capacity: 32
		});
	});

	it('keeps 14 standings with Melee ranks and numeric records', () => {
		expect(built.standings).toHaveLength(14);
		const winner = built.standings.find((row) => row.rank === 1);
		expect(winner).toMatchObject({
			points: 12,
			matchWins: 4,
			matchLosses: 0,
			matchDraws: 0,
			gameWins: 8,
			gameLosses: 1,
			gameDraws: 0
		});
	});

	it('keys people by Melee id and nulls a placeholder username', () => {
		expect(built.players).toHaveLength(14);
		const placeholder = built.players.find((player) => player.displayName === 'Test Player');
		expect(placeholder).toMatchObject({ id: 4606866, username: null });
		expect(built.players.find((player) => player.displayName === 'TentacleMom')?.username).toBe(
			'TentacleMom'
		);
	});

	it('maps every match to a round number, not Melee`s round id', () => {
		expect(built.matches).toHaveLength(28);
		expect(new Set(built.matches.map((row) => row.round))).toEqual(new Set([1, 2, 3, 4]));
		expect(built.matches.filter((row) => row.kind === 'draw')).toHaveLength(2);
	});

	it('reads the winner`s deck: three Legends sorted into a line, 40 main, 7 side, nothing unresolved', () => {
		const [deck] = built.decks;
		expect(built.decks).toHaveLength(1);
		expect(deck.guid).toBe(TENTACLE_DECK);
		expect(deck.name).toBe('G R R');
		expect(deck.unresolved).toBe(0);
		const line = (deck.legendLine ?? '').split('+');
		expect(line).toHaveLength(3);
		expect(line).toEqual([...line].sort());

		const count = (board: string) =>
			built.deckCards
				.filter((row) => row.board === board)
				.reduce((sum, row) => sum + row.quantity, 0);
		expect(count('legend')).toBe(3);
		expect(count('main')).toBe(40);
		expect(count('side')).toBe(7);
		expect(built.standings.find((row) => row.rank === 1)?.deckGuid).toBe(TENTACLE_DECK);
		expect(built.standings.filter((row) => row.deckGuid === null)).toHaveLength(13);
	});

	it('passes every invariant, including the matches agreeing with the standings', () => {
		expect(checkTournament(built, onlyWinnerHasADeck)).toEqual([]);
		expect(reviewDecks(built)).toEqual([]);
	});

	it('recomputes each player`s record from the matches alone', () => {
		const records = recordsFromMatches(built.matches);
		expect(records.size).toBe(14);
		for (const row of built.standings) {
			expect(records.get(row.playerId)).toEqual({
				wins: row.matchWins,
				losses: row.matchLosses,
				draws: row.matchDraws
			});
		}
	});
});

describe('the GetPlayerDetails fallback', () => {
	const noList = onlyWinnerHasADeck.find((standing) => standing.Rank === 12);

	it('gives a standing with no decklist the one the fallback found', () => {
		const playerId = noList?.Team.Players[0].ID ?? 0;
		const built = buildTournament(
			input({
				deckTexts: new Map([
					[TENTACLE_DECK, deckText],
					['fallback-guid', deckText]
				]),
				fallbackDecklists: new Map([[playerId, ['fallback-guid']]])
			})
		);
		expect(built.standings.find((row) => row.playerId === playerId)?.deckGuid).toBe(
			'fallback-guid'
		);
	});

	it('refuses to choose between two', () => {
		const playerId = noList?.Team.Players[0].ID ?? 0;
		expect(() =>
			buildTournament(input({ fallbackDecklists: new Map([[playerId, ['a', 'b']]]) }))
		).toThrow(/more than one decklist/);
	});

	it('names a deck whose page was never read', () => {
		expect(() => buildTournament(input({ deckTexts: new Map([['other', deckText]]) }))).toThrow(
			/No decklist page/
		);
	});
});

describe('synthetic: what Melee ranks but the results shouldn`t', () => {
	it('drops a player who played nothing, keeps ranks as given, and reports them', () => {
		const ghost = {
			...standings[0],
			Rank: 2,
			MatchWins: 0,
			MatchLosses: 0,
			MatchDraws: 0,
			GameWins: 0,
			GameLosses: 0,
			GameDraws: 0,
			GameCount: 0,
			Team: { Players: [{ ID: 99, DisplayName: 'Ghost', Username: 'ghost' }] }
		};
		const withGhost = [...onlyWinnerHasADeck, ghost];
		const built = buildTournament(
			input({ standings: withGhost, details: { ...details, ParticipatorCount: 15 } })
		);
		expect(built.notes.zeroRecordPlayers).toEqual([99]);
		expect(built.standings).toHaveLength(14);
		expect(built.standings.find((row) => row.rank === 2)?.playerId).not.toBe(99);
		expect(checkTournament(built, withGhost)).toEqual([]);
	});

	it('writes a bye as a match with no opponent', () => {
		const bye = match({
			Competitors: [match({}).Competitors[0]],
			ResultString: 'A was assigned a bye'
		});
		const built = buildTournament(input({ matches: [bye] }));
		expect(built.matches[0]).toMatchObject({ kind: 'bye', playerA: 1, playerB: null });
	});

	it('refuses a match in a round the page does not list', () => {
		expect(() => buildTournament(input({ matches: [match({ RoundId: 5 })] }))).toThrow(/round 5/);
	});
});

describe('the invariants catch what a bad run would produce', () => {
	const good = () => buildTournament(input());

	it('a player count that disagrees with the standings', () => {
		const built = buildTournament(input({ details: { ...details, ParticipatorCount: 20 } }));
		expect(checkTournament(built, onlyWinnerHasADeck).join('\n')).toMatch(/Melee says 20/);
	});

	it('a game record that does not add up', () => {
		const broken = onlyWinnerHasADeck.map((s) => (s.Rank === 1 ? { ...s, GameCount: 99 } : s));
		expect(checkTournament(good(), broken).join('\n')).toMatch(
			/TentacleMom: game record 9 is fewer than the 99 games/
		);
	});

	it("a top cut's cumulative record may exceed the Swiss game count (event 477190: 9-2-3 against 9)", () => {
		const cumulative = onlyWinnerHasADeck.map((s) => (s.Rank === 1 ? { ...s, GameCount: 5 } : s));
		expect(checkTournament(good(), cumulative)).toEqual([]);
	});

	it('matches that contradict the standings', () => {
		const built = good();
		const flipped = built.matches.map((row, index) =>
			index === 0 ? { ...row, gamesA: row.gamesB, gamesB: row.gamesA } : row
		);
		expect(checkTournament({ ...built, matches: flipped }, onlyWinnerHasADeck).join('\n')).toMatch(
			/but the matches add up to/
		);
	});

	it('a standing that points at a deck nobody read', () => {
		const built = good();
		const standingRows = built.standings.map((row, index) =>
			index === 0 ? { ...row, deckGuid: 'nope' } : row
		);
		expect(
			checkTournament({ ...built, standings: standingRows }, onlyWinnerHasADeck).join('\n')
		).toMatch(/deck nope, which wasn't read/);
	});

	it('a deck read with something other than three Legends is reported, not refused', () => {
		const built = good();
		const thin = {
			...built,
			notes: {
				...built.notes,
				deckReadings: [{ guid: 'g', legends: 2, mainCards: 38, unresolved: 3 }]
			}
		};
		expect(reviewDecks(thin)).toEqual([
			'g: 2 Legends, not 3.',
			'g: 38 main-deck cards, outside 40–50.',
			'g: 3 lines named no single Card.'
		]);
		expect(checkTournament(thin, onlyWinnerHasADeck)).toEqual([]);
	});
});

describe('a list that was registered but left blank', () => {
	it('is no deck at all, and says so', () => {
		const built = buildTournament(input({ deckTexts: new Map([[TENTACLE_DECK, '  \n']]) }));
		expect(built.decks).toEqual([]);
		expect(built.deckCards).toEqual([]);
		expect(built.standings.every((row) => row.deckGuid === null)).toBe(true);
		expect(built.notes.blankDecks).toEqual([TENTACLE_DECK]);
		expect(checkTournament(built, onlyWinnerHasADeck)).toEqual([]);
	});
});
