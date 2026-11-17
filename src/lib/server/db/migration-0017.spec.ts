/**
 * Migration 0017 adds `tournaments.kind`. It must be additive: events already stored keep every column
 * and read as `Other` until `pnpm melee --reparse` decides their kind from the name.
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

it('adds kind to existing events without touching them, defaulting to Other', () => {
	const sqlite = new DatabaseSync(':memory:');
	const files = readdirSync(MIGRATIONS)
		.filter((name) => /^\d{4}_.*\.sql$/.test(name))
		.sort();
	const target = files.findIndex((name) => name.startsWith('0017_'));
	expect(target).toBeGreaterThan(0);
	for (const file of files.slice(0, target)) apply(sqlite, file);

	sqlite.exec(`INSERT INTO tournaments (id, name, starts_at, organizer_id, organizer_name, format, format_id, player_count)
		VALUES (7, 'Night City Showdown', 1, 1, 'o', 'f', 'f', 12)`);
	apply(sqlite, files[target] ?? '');

	expect(sqlite.prepare('SELECT id, name, player_count, kind FROM tournaments').all()).toEqual([
		{ id: 7, name: 'Night City Showdown', player_count: 12, kind: 'Other' }
	]);
	const indexes = sqlite
		.prepare(`SELECT name FROM pragma_index_list('tournaments')`)
		.all()
		.map((row) => row.name);
	expect(indexes).toContain('tournaments_kind_idx');
});
