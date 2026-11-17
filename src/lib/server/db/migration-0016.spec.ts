/**
 * Migration 0016 rebuilds `tournament_deck_cards` with the Tournament on every row. The other specs
 * run it against an empty table; this one runs it over rows that already exist, which is the only way
 * production (and a developer's local D1) ever meets it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = new URL('../../../../drizzle/', import.meta.url);
const apply = (sqlite: DatabaseSync, file: string) => {
	for (const statement of readFileSync(new URL(file, MIGRATIONS), 'utf8').split(
		'--> statement-breakpoint'
	)) {
		if (statement.trim()) sqlite.exec(statement);
	}
};

describe('migration 0016: tournament_id on tournament_deck_cards', () => {
	it('gives every existing card row its deck’s Tournament and keeps the constraints', () => {
		const sqlite = new DatabaseSync(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON');
		const files = readdirSync(MIGRATIONS)
			.filter((name) => /^\d{4}_.*\.sql$/.test(name))
			.sort();
		const target = files.findIndex((name) => name.startsWith('0016_'));
		expect(target).toBeGreaterThan(0);
		for (const file of files.slice(0, target)) apply(sqlite, file);

		const text = (name: string) => `'${name}'`;
		sqlite.exec(`
			INSERT INTO players (id, display_name) VALUES (1, 'A'), (2, 'B');
			INSERT INTO tournaments (id, name, starts_at, organizer_id, organizer_name, format, format_id, player_count)
				VALUES (10, 'One', 1, 1, 'o', 'f', 'f', 2), (20, 'Two', 2, 1, 'o', 'f', 'f', 2);
			INSERT INTO tournament_decks (guid, tournament_id, player_id, name, text) VALUES
				('g1', 10, 1, 'd', 'x'), ('g2', 20, 2, 'd', 'x');
			INSERT INTO tournament_deck_cards (deck_guid, card_slug, board, quantity) VALUES
				('g1', ${text('a')}, 'main', 3), ('g1', ${text('l')}, 'legend', 1), ('g2', ${text('a')}, 'side', 2);
		`);

		apply(sqlite, files[target] ?? '');

		const rows = sqlite
			.prepare(
				'SELECT deck_guid, tournament_id, card_slug, board, quantity FROM tournament_deck_cards ORDER BY deck_guid, board'
			)
			.all()
			.map((row) => ({ ...row }));
		expect(rows).toEqual([
			{ deck_guid: 'g1', tournament_id: 10, card_slug: 'l', board: 'legend', quantity: 1 },
			{ deck_guid: 'g1', tournament_id: 10, card_slug: 'a', board: 'main', quantity: 3 },
			{ deck_guid: 'g2', tournament_id: 20, card_slug: 'a', board: 'side', quantity: 2 }
		]);
		expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

		// The indexes survive the rebuild, and deleting an event still cascades through its cards.
		const indexes = sqlite
			.prepare(`SELECT name FROM pragma_index_list('tournament_deck_cards') ORDER BY name`)
			.all()
			.map((row) => row.name);
		expect(indexes).toEqual(
			expect.arrayContaining(['tournament_deck_cards_board_idx', 'tournament_deck_cards_card_idx'])
		);
		sqlite.exec('DELETE FROM tournaments WHERE id = 10');
		expect(sqlite.prepare('SELECT count(*) AS n FROM tournament_deck_cards').get()).toEqual({
			n: 1
		});
	});
});
