/**
 * What the event page is built from, over the captured tournament 485070 — the same fixtures the
 * ingest is tested with, run through the ingest's own builder and then through this one, so the two
 * halves are tested against each other rather than against hand-written rows.
 */
import { describe, expect, it } from 'vitest';
import { dataset } from '../cards/index.ts';
import { buildTournament } from './build.ts';
import { buildEventView, type EventRows } from './event-view.ts';
import { ID, WINNER_DECK, deckText, details, info, matches, standings, view } from './testing.ts';

const onlyWinnerHasADeck = standings.map((standing) =>
	standing.Rank === 1 ? standing : { ...standing, Decklists: [] }
);

/** What the data layer would have selected for the built Tournament. */
function rowsFor(
	built = buildTournament({
		details,
		info,
		rounds: view.rounds,
		standings: onlyWinnerHasADeck,
		matches,
		deckTexts: new Map([[WINNER_DECK, deckText]]),
		cards: dataset.cards
	})
): EventRows {
	const player = (id: number) => {
		const found = built.players.find((p) => p.id === id);
		if (!found) throw new Error(`no player ${id}`);
		return { id, displayName: found.displayName, username: found.username ?? null };
	};
	return {
		tournament: {
			...built.tournament,
			kind: built.tournament.kind ?? 'Other',
			id: ID,
			venue: built.tournament.venue ?? null,
			tournamentType: built.tournament.tournamentType ?? null,
			entryFee: built.tournament.entryFee ?? null,
			registration: built.tournament.registration ?? null,
			capacity: built.tournament.capacity ?? null,
			ingestedAt: new Date(0)
		},
		rounds: built.rounds,
		standings: built.standings.map((standing) => ({
			standing: { ...standing, deckGuid: standing.deckGuid ?? null },
			player: player(standing.playerId)
		})),
		decks: built.decks.map((deck) => ({
			...deck,
			legendLine: deck.legendLine ?? null,
			ram: deck.ram ?? null,
			unresolved: deck.unresolved ?? 0
		})),
		deckCards: built.deckCards,
		matches: built.matches.map((match, index) => ({
			id: index + 1,
			...match,
			tableNumber: match.tableNumber ?? null,
			playerB: match.playerB ?? null
		}))
	};
}

describe('the event view', () => {
	const event = buildEventView(rowsFor());

	it('describes the event and links back to Melee', () => {
		expect(event).toMatchObject({
			id: 485070,
			name: 'The Hungry Dragon, Cyberpunk TCG: Night City Showdown',
			organizer: 'The_hungry_dragon',
			playerCount: 14,
			deckCount: 1,
			meleeUrl: 'https://melee.gg/Tournament/View/485070'
		});
		expect(event.startsAt).toBe(Date.parse('2026-11-16T00:30:00Z'));
	});

	it("carries the header's fields and a kind derived from the name", () => {
		expect(event).toMatchObject({
			kind: 'Showdown',
			venue: 'the hungry dragon',
			tournamentType: 'Tabletop',
			entryFee: '$20.00 (External to Melee)',
			registration: 'Open Registration',
			capacity: 32
		});
	});

	it('lists every standing in rank order with numeric records', () => {
		expect(event.standings).toHaveLength(14);
		expect(event.standings.map((s) => s.rank)).toEqual(
			[...event.standings.map((s) => s.rank)].sort((a, b) => a - b)
		);
		expect(event.standings[0]).toMatchObject({
			rank: 1,
			name: 'TentacleMom',
			points: 12,
			wins: 4,
			losses: 0,
			draws: 0
		});
	});

	it("attaches the winner's deck, and leaves everyone else deck-less rather than missing", () => {
		expect(event.standings[0].deck).not.toBeNull();
		expect(event.standings.slice(1).every((s) => s.deck === null)).toBe(true);
		expect(event.standings.filter((s) => s.deck)).toHaveLength(event.deckCount);
	});

	it('carries the deck`s RAM, for the standings to show beside its Legends', () => {
		const deck = event.standings[0].deck;
		expect(deck?.ram).toMatch(/^[bgry]+$/);
	});

	it('reads the deck as three Legends and copy-sorted boards', () => {
		const deck = event.standings[0].deck;
		expect(deck?.legends).toHaveLength(3);
		expect(deck?.legends).toEqual([...(deck?.legends ?? [])].sort());
		expect(deck?.main.reduce((n, c) => n + c.quantity, 0)).toBe(40);
		expect(deck?.side.reduce((n, c) => n + c.quantity, 0)).toBe(7);
		const quantities = deck?.main.map((c) => c.quantity) ?? [];
		expect(quantities).toEqual([...quantities].sort((a, b) => b - a));
	});

	it('numbers rounds and puts every match in one of them, in order', () => {
		expect(event.rounds.map((r) => r.number)).toEqual([1, 2, 3, 4]);
		expect(event.matches).toHaveLength(28);
		const rounds = new Set(event.rounds.map((r) => r.number));
		expect(event.matches.every((m) => rounds.has(m.round))).toBe(true);
		const order = event.matches.map((m) => m.round);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	it('names both sides of a match from the standings', () => {
		const names = new Set(event.standings.map((s) => s.name));
		for (const match of event.matches) {
			expect(names.has(match.a.name)).toBe(true);
			if (match.b) expect(names.has(match.b.name)).toBe(true);
		}
	});

	it('keeps a bye as a match with no opponent', () => {
		const rows = rowsFor();
		const [first] = rows.matches;
		rows.matches[0] = { ...first, playerB: null, kind: 'bye' };
		expect(buildEventView(rows).matches[0]).toMatchObject({ b: null, kind: 'bye' });
	});

	it('does not fall over on a player the standings do not list', () => {
		const rows = rowsFor();
		rows.matches[0] = { ...rows.matches[0], playerB: 999 };
		expect(buildEventView(rows).matches[0].b).toEqual({ playerId: 999, name: 'Player 999' });
	});
});
