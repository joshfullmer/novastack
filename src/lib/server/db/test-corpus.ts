/**
 * A large, deterministic, plausible tournament corpus for measuring how the queries scale. Only for
 * tests and the opt-in scale audit (`scale.spec.ts`).
 *
 * Plausible in the ways that decide a query's cost: a few staple cards in most decks and a long tail of
 * rare ones, a few popular Legends and many niche ones (so Legend lines have a long tail), about 30
 * players an event drawn from a smaller pool of returning players, ~60% of players with a list, and
 * Swiss rounds sized to the field. A seeded generator, so a measurement can be repeated.
 */
import type { DatabaseSync } from 'node:sqlite';

export type CorpusSize = {
	events: number;
	/** Distinct people who play across all events. */
	playerPool?: number;
	legends?: number;
	cards?: number;
	/** Share of players who registered a list. */
	deckRate?: number;
	/** First event's start; the rest follow every ~43 hours. */
	start?: string;
};

/** Small, fast, seedable PRNG (mulberry32). */
function rng(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Index 0..n-1, heavily favouring the low ones (a Zipf-ish long tail). */
const skewed = (random: () => number, n: number) => Math.min(n - 1, Math.floor(n * random() ** 3));

export function seedCorpus(sqlite: DatabaseSync, size: CorpusSize) {
	const random = rng(42);
	const playerPool = size.playerPool ?? 3000;
	const legendCount = size.legends ?? 40;
	const cardCount = size.cards ?? 150;
	const deckRate = size.deckRate ?? 0.6;
	const start = Date.parse(size.start ?? '2024-01-01T12:00:00Z');

	const stmt = (sql: string) => sqlite.prepare(sql);
	const insertEvent = stmt(
		`INSERT INTO tournaments (id, name, kind, starts_at, organizer_id, organizer_name, format, format_id, player_count, venue, tournament_type, registration, capacity)
		 VALUES (?, ?, ?, ?, ?, ?, 'Constructed', 'f', ?, 'Venue', 'Tabletop', 'Open Registration', 64)`
	);
	const insertRound = stmt(
		`INSERT INTO tournament_rounds (tournament_id, number, melee_round_id, name) VALUES (?, ?, ?, ?)`
	);
	const insertPlayer = stmt(
		`INSERT OR IGNORE INTO players (id, display_name, username) VALUES (?, ?, NULL)`
	);
	const insertDeck = stmt(
		`INSERT INTO tournament_decks (guid, tournament_id, player_id, name, text, legend_line, unresolved) VALUES (?, ?, ?, 'deck', 'x', ?, 0)`
	);
	const insertCard = stmt(
		`INSERT INTO tournament_deck_cards (deck_guid, tournament_id, card_slug, board, quantity) VALUES (?, ?, ?, ?, ?)`
	);
	const insertStanding = stmt(
		`INSERT INTO standings (tournament_id, player_id, rank, points, match_wins, match_losses, match_draws, game_wins, game_losses, game_draws, deck_guid)
		 VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)`
	);
	const insertMatch = stmt(
		`INSERT INTO tournament_matches (tournament_id, round, table_number, player_a, player_b, games_a, games_b, draws, kind)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'played')`
	);

	let decks = 0;
	sqlite.exec('BEGIN');
	for (let e = 1; e <= size.events; e += 1) {
		const players = 12 + Math.floor(random() * 40); // 12..51, about 30 on average
		const rounds = Math.max(3, Math.ceil(Math.log2(players)));
		// Mostly Showdowns, a Regional now and then, as the real mix is expected to be.
		const regional = e % 12 === 0;
		insertEvent.run(
			e,
			regional ? `Night City Regional ${e}` : `Night City Showdown ${e}`,
			regional ? 'Regional' : 'Showdown',
			start + e * 43 * 3600_000,
			1 + (e % 25),
			`Organizer ${e % 25}`,
			players
		);
		for (let r = 1; r <= rounds; r += 1) insertRound.run(e, r, e * 100 + r, `Round ${r}`);

		// who played: distinct people from the pool
		const ids = new Set<number>();
		while (ids.size < players) ids.add(1 + Math.floor(random() * playerPool));
		const people = [...ids];

		const deckOf = new Map<number, string>();
		for (const [i, id] of people.entries()) {
			insertPlayer.run(id, `Player ${id}`);
			const rank = i + 1;
			const wins = Math.round(rounds * (1 - (rank - 1) / players));
			let guid: string | null = null;
			if (random() < deckRate) {
				guid = `d${(decks += 1)}`;
				const legends = new Set<string>();
				while (legends.size < 3) legends.add(`legend-${skewed(random, legendCount)}`);
				const line = [...legends].sort().join('+');
				insertDeck.run(guid, e, id, line);
				for (const l of legends) insertCard.run(guid, e, l, 'legend', 1);
				// ~25 distinct main-deck cards summing to ~40 copies, ~4 sideboard cards
				const main = new Set<string>();
				while (main.size < 25) main.add(`card-${skewed(random, cardCount)}`);
				for (const c of main) insertCard.run(guid, e, c, 'main', 1 + Math.floor(random() * 3));
				const side = new Set<string>();
				while (side.size < 4) {
					const c = `card-${skewed(random, cardCount)}`;
					if (!main.has(c)) side.add(c);
				}
				for (const c of side) insertCard.run(guid, e, c, 'side', 1 + Math.floor(random() * 2));
				deckOf.set(id, guid);
			}
			insertStanding.run(e, id, rank, wins * 3, wins, rounds - wins, guid);
		}

		for (let r = 1; r <= rounds; r += 1) {
			for (let t = 0; t + 1 < people.length; t += 2) {
				const win = random() < 0.5;
				insertMatch.run(e, r, t / 2 + 1, people[t], people[t + 1], win ? 2 : 1, win ? 1 : 2);
			}
		}
	}
	sqlite.exec('COMMIT');
}
