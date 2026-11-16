/**
 * The SQL `pnpm melee` writes, run against a real SQLite built from this repo's own migrations
 * (`drizzle/*.sql`, in order) — so a column that doesn't exist, a foreign key out of order, or an
 * escape that loses an apostrophe fails here, not at a `wrangler d1 execute`.
 *
 * SQLite here is `node:sqlite`, not D1: same engine, so the semantics tested (cascades, escaping)
 * are the engine's. Whether a bare `--file` rolls back on failure was spiked separately (spec §4.4).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { dataset } from '../cards/index.ts';
import { buildTournament } from './build.ts';
import {
	OWNED_TABLES,
	diffAgainstStored,
	literal,
	reindexStatements,
	storedQueries,
	toFile,
	writeStatements,
	type OwnedTable
} from './sql.ts';
import { ID, WINNER_DECK, deckText, details, matches, standings, view } from './testing.ts';

const MIGRATIONS = new URL('../../../drizzle/', import.meta.url);

/** A database with every migration applied, as production has. */
function migrated() {
	const db = new DatabaseSync(':memory:');
	const files = readdirSync(MIGRATIONS)
		.filter((name) => /^\d{4}_.*\.sql$/.test(name))
		.sort();
	for (const file of files) {
		for (const statement of readFileSync(new URL(file, MIGRATIONS), 'utf8').split(
			'--> statement-breakpoint'
		)) {
			if (statement.trim()) db.exec(statement);
		}
	}
	return db;
}

const onlyWinnerHasADeck = standings.map((standing) =>
	standing.Rank === 1 ? standing : { ...standing, Decklists: [] }
);

const build = (overrides: Partial<Parameters<typeof buildTournament>[0]> = {}) =>
	buildTournament({
		details,
		rounds: view.rounds,
		standings: onlyWinnerHasADeck,
		matches,
		deckTexts: new Map([[WINNER_DECK, deckText]]),
		cards: dataset.cards,
		...overrides
	});

const count = (db: DatabaseSync, table: string) =>
	Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);

const write = (db: DatabaseSync, built = build()) => db.exec(toFile(writeStatements(built)));

describe('writing a Tournament', () => {
	it('lands every row of the captured event, in foreign-key order', () => {
		const db = migrated();
		write(db);
		expect(count(db, 'tournaments')).toBe(1);
		expect(count(db, 'tournament_rounds')).toBe(4);
		expect(count(db, 'players')).toBe(14);
		expect(count(db, 'standings')).toBe(14);
		expect(count(db, 'tournament_matches')).toBe(28);
		expect(count(db, 'tournament_decks')).toBe(1);
		expect(count(db, 'tournament_deck_cards')).toBeGreaterThan(10);
	});

	it("round-trips the winner's deck exactly, apostrophe and newlines included", () => {
		const db = migrated();
		write(db);
		const deck = db.prepare('SELECT * FROM tournament_decks').get();
		expect(deck?.text).toBe(deckText);
		expect(String(deck?.text)).toContain("Don't Call Me Simon");
		expect(deck?.legend_line).toBe(build().decks[0].legendLine);
		expect(deck?.unresolved).toBe(0);
	});

	it('stores dates as milliseconds, booleans as 0/1, a placeholder username as NULL', () => {
		const db = migrated();
		write(db);
		const row = db.prepare('SELECT * FROM tournaments').get();
		expect(row?.starts_at).toBe(Date.parse('2026-11-16T00:30:00Z'));
		expect(Number(row?.ingested_at)).toBeGreaterThan(0); // the database's own default
		expect(
			db.prepare("SELECT username FROM players WHERE display_name = 'Test Player'").get()?.username
		).toBeNull();
	});

	it('is idempotent: writing the same Tournament twice changes nothing', () => {
		const db = migrated();
		write(db);
		write(db);
		for (const table of [
			'tournaments',
			'standings',
			'tournament_matches',
			'tournament_deck_cards',
			'players'
		]) {
			expect(count(db, table)).toBe(
				{
					tournaments: 1,
					standings: 14,
					tournament_matches: 28,
					tournament_deck_cards: build().deckCards.length,
					players: 14
				}[table]
			);
		}
	});

	it('a rerun replaces what was there, rather than adding to it', () => {
		const db = migrated();
		write(db);
		const changed = build();
		changed.standings[0] = { ...changed.standings[0], points: 99 };
		write(db, changed);
		expect(count(db, 'standings')).toBe(14);
		expect(
			db.prepare('SELECT points FROM standings WHERE rank = ?').get(changed.standings[0].rank)
				?.points
		).toBe(99);
	});

	it('a rerun that now has no decks leaves none behind', () => {
		const db = migrated();
		write(db);
		const noLists = standings.map((standing) => ({ ...standing, Decklists: [] }));
		write(db, build({ deckTexts: new Map(), standings: noLists }));
		expect(count(db, 'tournament_decks')).toBe(0);
		expect(count(db, 'tournament_deck_cards')).toBe(0);
		expect(count(db, 'standings')).toBe(14);
	});

	it("keeps a shared player's latest name, and keeps the player when an event is deleted", () => {
		const db = migrated();
		write(db);
		const renamed = build();
		renamed.players[0] = { ...renamed.players[0], displayName: 'Renamed Player' };
		write(db, renamed);
		expect(count(db, 'players')).toBe(14);
		expect(
			db.prepare('SELECT display_name FROM players WHERE id = ?').get(Number(renamed.players[0].id))
				?.display_name
		).toBe('Renamed Player');

		db.exec(`DELETE FROM tournaments WHERE id = ${ID}`);
		for (const table of [
			'tournament_rounds',
			'standings',
			'tournament_matches',
			'tournament_decks',
			'tournament_deck_cards'
		]) {
			expect(count(db, table)).toBe(0); // cascaded
		}
		expect(count(db, 'players')).toBe(14);
	});
});

describe('literal', () => {
	it('escapes the one character that matters, and nothing else', () => {
		expect(literal("O'Neil")).toBe("'O''Neil'");
		expect(literal('a\nb')).toBe("'a\nb'");
		expect(literal('50% "off" \\ done')).toBe(`'50% "off" \\ done'`);
	});

	it('writes null, numbers, booleans and dates as SQLite stores them', () => {
		expect(literal(null)).toBe('NULL');
		expect(literal(undefined)).toBe('NULL');
		expect(literal(7)).toBe('7');
		expect(literal(true)).toBe('1');
		expect(literal(false)).toBe('0');
		expect(literal(new Date(1_000))).toBe('1000');
	});

	it('refuses what SQL cannot hold', () => {
		expect(() => literal(Number.NaN)).toThrow();
		expect(() => literal('a\0b')).toThrow(/NUL/);
		expect(() => literal({})).toThrow();
	});
});

describe('--check: is what is stored what we would write?', () => {
	const stored = (db: DatabaseSync, id = ID) =>
		new Map<OwnedTable, readonly Record<string, unknown>[]>(
			OWNED_TABLES.map((table) => [table, db.prepare(storedQueries(id)[table]).all()] as const)
		);

	it('says nothing differs right after a write', () => {
		const db = migrated();
		write(db);
		expect(diffAgainstStored(build(), stored(db))).toEqual([]);
	});

	it('says everything differs for a Tournament that is not stored', () => {
		const diff = diffAgainstStored(build(), stored(migrated()));
		expect(diff.join('\n')).toMatch(/tournaments: 0 stored, 1 built/);
		expect(diff.length).toBe(OWNED_TABLES.length);
	});

	it('names the table whose stored row has drifted', () => {
		const db = migrated();
		write(db);
		db.exec('UPDATE standings SET points = points + 1 WHERE rank = 1');
		expect(diffAgainstStored(build(), stored(db))).toEqual([
			'standings: 14 stored, 14 built, 1 differ'
		]);
	});

	it('notices a match that is no longer there', () => {
		const db = migrated();
		write(db);
		db.exec('DELETE FROM tournament_matches WHERE id = (SELECT min(id) FROM tournament_matches)');
		expect(diffAgainstStored(build(), stored(db))[0]).toMatch(
			/tournament_matches: 27 stored, 28 built/
		);
	});
});

describe('--reparse: rebuild the derived columns from stored text', () => {
	it('restores what was derived, from nothing but the text', () => {
		const db = migrated();
		write(db);
		const before = db.prepare('SELECT legend_line, unresolved FROM tournament_decks').get();
		db.exec(
			'UPDATE tournament_decks SET legend_line = NULL, unresolved = 9; DELETE FROM tournament_deck_cards;'
		);
		expect(count(db, 'tournament_deck_cards')).toBe(0);

		const decks = db.prepare('SELECT guid, text FROM tournament_decks').all();
		db.exec(
			toFile(
				reindexStatements(
					decks.map((row) => ({ guid: String(row.guid), text: String(row.text) })),
					dataset.cards
				)
			)
		);
		expect(db.prepare('SELECT legend_line, unresolved FROM tournament_decks').get()).toEqual(
			before
		);
		expect(count(db, 'tournament_deck_cards')).toBe(build().deckCards.length);
	});
});
