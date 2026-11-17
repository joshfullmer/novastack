/**
 * Migration 0018 adds `tournament_decks.ram`. It must be additive: decks already stored keep every
 * column and read as null until `pnpm melee --reparse` works out what their Legends provide.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

const MIGRATIONS = new URL('../../../../drizzle/', import.meta.url);
const apply = (sqlite: DatabaseSync, file: string) => {
	for (const statement of readFileSync(new URL(file, MIGRATIONS), 'utf8').split(
		'--> statement-breakpoint'
	)) {
		if (statement.trim()) sqlite.exec(statement);
	}
};

it('adds ram to existing decks without touching them, and indexes it', () => {
	const sqlite = new DatabaseSync(':memory:');
	const files = readdirSync(MIGRATIONS)
		.filter((name) => /^\d{4}_.*\.sql$/.test(name))
		.sort();
	const target = files.findIndex((name) => name.startsWith('0018_'));
	expect(target).toBeGreaterThan(0);
	for (const file of files.slice(0, target)) apply(sqlite, file);

	sqlite.exec(`INSERT INTO tournaments (id, name, starts_at, organizer_id, organizer_name, format, format_id, player_count)
		VALUES (7, 'Night City Showdown', 1, 1, 'o', 'f', 'f', 12)`);
	sqlite.exec(`INSERT INTO players (id, display_name) VALUES (1, 'P1')`);
	sqlite.exec(`INSERT INTO tournament_decks (guid, tournament_id, player_id, name, text, legend_line)
		VALUES ('D1', 7, 1, 'deck', 'x', 'a+b+c')`);
	apply(sqlite, files[target] ?? '');

	expect(sqlite.prepare('SELECT guid, legend_line, ram FROM tournament_decks').all()).toEqual([
		{ guid: 'D1', legend_line: 'a+b+c', ram: null }
	]);
	const indexes = sqlite
		.prepare(`SELECT name FROM pragma_index_list('tournament_decks')`)
		.all()
		.map((row) => row.name);
	expect(indexes).toContain('tournament_decks_ram_idx');
});
