/**
 * The tournament tables arrive in one migration (`0014_*`, the squash of what were five). Production and
 * every developer's local D1 meet it the same way: on top of the tables that were already there, which it
 * must not touch. This runs it that way, over data in an existing table.
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

const files = readdirSync(MIGRATIONS)
	.filter((name) => /^\d{4}_.*\.sql$/.test(name))
	.sort();
const target = files.findIndex((name) => name.startsWith('0014_'));

const tables = (sqlite: DatabaseSync) =>
	sqlite
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
		.all()
		.map((row) => String(row.name))
		.sort();
const columns = (sqlite: DatabaseSync, table: string) =>
	sqlite
		.prepare(`SELECT name, type, "notnull", dflt_value FROM pragma_table_info('${table}')`)
		.all()
		.map((row) => ({ ...row }));
const indexes = (sqlite: DatabaseSync, table: string) =>
	sqlite
		.prepare(`SELECT name FROM pragma_index_list('${table}')`)
		.all()
		.map((row) => String(row.name));

describe('the tournament migration', () => {
	const before = new DatabaseSync(':memory:');
	before.exec('PRAGMA foreign_keys = ON');
	for (const file of files.slice(0, target)) apply(before, file);
	const existing = tables(before);
	const snapshot = new Map(existing.map((table) => [table, columns(before, table)]));
	const after = before;
	apply(after, files[target] ?? '');

	it('is the first migration after the app’s own tables', () => {
		expect(target).toBeGreaterThan(0);
	});

	it('adds the tournament tables and leaves every existing table as it was', () => {
		const now = tables(after);
		expect(now).toEqual(expect.arrayContaining(existing));
		expect(now.filter((name) => !existing.includes(name))).toEqual([
			'metas',
			'players',
			'standings',
			'tournament_deck_cards',
			'tournament_decks',
			'tournament_matches',
			'tournament_rounds',
			'tournaments'
		]);
		for (const [table, was] of snapshot) expect(columns(after, table)).toEqual(was);
	});

	it('gives an event its kind (Other until told), a deck its RAM (null until known), and the card rows their event', () => {
		const kind = columns(after, 'tournaments').find((c) => c.name === 'kind');
		expect(kind).toMatchObject({ notnull: 1, dflt_value: "'Other'" });
		expect(columns(after, 'tournament_decks').find((c) => c.name === 'ram')).toMatchObject({
			notnull: 0
		});
		expect(
			columns(after, 'tournament_deck_cards').find((c) => c.name === 'tournament_id')
		).toMatchObject({ notnull: 1 });
	});

	it('carries the indexes the pages are built on', () => {
		expect(indexes(after, 'tournaments')).toEqual(
			expect.arrayContaining(['tournaments_kind_idx', 'tournaments_starts_at_idx'])
		);
		expect(indexes(after, 'tournament_decks')).toEqual(
			expect.arrayContaining(['tournament_decks_ram_idx', 'tournament_decks_legend_line_idx'])
		);
		expect(indexes(after, 'tournament_deck_cards')).toEqual(
			expect.arrayContaining(['tournament_deck_cards_board_idx', 'tournament_deck_cards_card_idx'])
		);
	});

	it('deletes an event’s decks and card rows with it', () => {
		after.exec(`
			INSERT INTO players (id, display_name) VALUES (1, 'A');
			INSERT INTO tournaments (id, name, starts_at, organizer_id, organizer_name, format, format_id, player_count)
				VALUES (10, 'One', 1, 1, 'o', 'f', 'f', 1);
			INSERT INTO tournament_decks (guid, tournament_id, player_id, name, text) VALUES ('g1', 10, 1, 'd', 'x');
			INSERT INTO tournament_deck_cards (deck_guid, tournament_id, card_slug, board, quantity)
				VALUES ('g1', 10, 'a', 'main', 3);
		`);
		after.exec('DELETE FROM tournaments WHERE id = 10');
		expect(after.prepare('SELECT count(*) AS n FROM tournament_decks').get()).toEqual({ n: 0 });
		expect(after.prepare('SELECT count(*) AS n FROM tournament_deck_cards').get()).toEqual({
			n: 0
		});
	});
});
