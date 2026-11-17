/**
 * Seed a small, hand-computable tournament world into a test database (`test-db.ts`).
 *
 * Direct INSERTs, not the ingest, on purpose: a query test wants a world small enough to count on
 * your fingers, with the cards, finishes and matches chosen to make one number come out. Only for tests.
 */
import type { DatabaseSync } from 'node:sqlite';

export type SeedDeck = {
	guid: string;
	/** Legend slugs; the deck's `legend_line` is these, sorted and joined with `+`. */
	legends: string[];
	/** What the Legends provide together (`tournament_decks.ram`); null when it can't be known. */
	ram?: string | null;
	main?: Record<string, number>;
	side?: Record<string, number>;
	name?: string;
};

export type SeedPlayer = {
	id: number;
	name: string;
	rank: number;
	wins: number;
	losses: number;
	draws?: number;
	deck?: SeedDeck;
};

export type SeedMatch = {
	round: number;
	a: number;
	/** Null for a bye. */
	b: number | null;
	gamesA: number;
	gamesB: number;
	kind?: 'played' | 'draw' | 'bye' | 'forfeit';
};

export type SeedEvent = {
	id: number;
	name: string;
	/** ISO, UTC. */
	startsAt: string;
	organizer?: string;
	kind?: string;
	players: SeedPlayer[];
	matches?: SeedMatch[];
	rounds?: number;
};

export function seedEvent(sqlite: DatabaseSync, event: SeedEvent): void {
	const run = (sql: string, ...params: (string | number | null)[]) =>
		sqlite.prepare(sql).run(...params);

	run(
		`INSERT INTO tournaments (id, name, kind, starts_at, organizer_id, organizer_name, format, format_id, player_count)
		 VALUES (?, ?, ?, ?, 1, ?, 'Constructed', 'f', ?)`,
		event.id,
		event.name,
		event.kind ?? 'Other',
		Date.parse(event.startsAt),
		event.organizer ?? 'Organizer',
		event.players.length
	);
	for (let n = 1; n <= (event.rounds ?? 1); n += 1) {
		run(
			`INSERT INTO tournament_rounds (tournament_id, number, melee_round_id, name) VALUES (?, ?, ?, ?)`,
			event.id,
			n,
			event.id * 100 + n,
			`Round ${n}`
		);
	}

	for (const p of event.players) {
		run(
			`INSERT OR REPLACE INTO players (id, display_name, username) VALUES (?, ?, NULL)`,
			p.id,
			p.name
		);
		if (p.deck) {
			const d = p.deck;
			run(
				`INSERT INTO tournament_decks (guid, tournament_id, player_id, name, text, legend_line, ram, unresolved)
				 VALUES (?, ?, ?, ?, 'x', ?, ?, 0)`,
				d.guid,
				event.id,
				p.id,
				d.name ?? 'deck',
				d.legends.length === 3 ? [...d.legends].sort().join('+') : null,
				d.ram ?? null
			);
			const card = (slug: string, board: string, quantity: number) =>
				run(
					`INSERT INTO tournament_deck_cards (deck_guid, tournament_id, card_slug, board, quantity) VALUES (?, ?, ?, ?, ?)`,
					d.guid,
					event.id,
					slug,
					board,
					quantity
				);
			for (const slug of d.legends) card(slug, 'legend', 1);
			for (const [slug, quantity] of Object.entries(d.main ?? {})) card(slug, 'main', quantity);
			for (const [slug, quantity] of Object.entries(d.side ?? {})) card(slug, 'side', quantity);
		}
		const draws = p.draws ?? 0;
		run(
			`INSERT INTO standings (tournament_id, player_id, rank, points, match_wins, match_losses, match_draws,
			   game_wins, game_losses, game_draws, deck_guid) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
			event.id,
			p.id,
			p.rank,
			p.wins * 3 + draws,
			p.wins,
			p.losses,
			draws,
			p.deck?.guid ?? null
		);
	}

	for (const m of event.matches ?? []) {
		run(
			`INSERT INTO tournament_matches (tournament_id, round, table_number, player_a, player_b, games_a, games_b, draws, kind)
			 VALUES (?, ?, 1, ?, ?, ?, ?, 0, ?)`,
			event.id,
			m.round,
			m.a,
			m.b,
			m.gamesA,
			m.gamesB,
			m.kind ?? (m.b === null ? 'bye' : 'played')
		);
	}
}
