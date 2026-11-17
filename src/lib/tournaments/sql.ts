/**
 * A built Tournament → the SQL that writes it — `docs/spec/tournaments.md` §4.4.
 *
 * Plain text for `wrangler d1 execute --file`. Pure, and **free of any runtime import of the Drizzle
 * schema**: `schema.ts` and its generated auth file import with `.js` specifiers, which plain `node`
 * can't resolve, and this runs under `node scripts/melee.ts`. Column names are therefore derived
 * (`startsAt` → `starts_at`) and every one is checked against the real migrations by running this SQL
 * in SQLite (`sql.spec.ts`): a key with no column fails there, not at a `wrangler` call.
 *
 * Values are escaped literals, not bound parameters, because that is what a `--file` is. The one
 * escape that matters is `'` → `''`; deck text is free text and contains apostrophes and newlines.
 */
import type { Card } from '../cards/schema.ts';
import type { BuiltTournament } from './build.ts';
import { indexDeck } from './decks.ts';
import { eventKind } from './kind.ts';

type Row = Readonly<Record<string, unknown>>;

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** What SQLite stores for a JS value: a Date is its milliseconds, a boolean 1 or 0. */
function dbValue(value: unknown): string | number | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error(`Can't write ${value} as SQL.`);
		return value;
	}
	if (typeof value === 'string') {
		if (value.includes('\0')) throw new Error("Can't write a NUL character as SQL.");
		return value;
	}
	throw new Error(`Can't write a ${typeof value} as SQL.`);
}

export function literal(value: unknown): string {
	const stored = dbValue(value);
	if (stored === null) return 'NULL';
	return typeof stored === 'number' ? String(stored) : `'${stored.replaceAll("'", "''")}'`;
}

/** One row, keyed as the Drizzle insert shape is; a key left `undefined` is left to its default. */
function insert(table: string, row: Row): string {
	const keys = Object.keys(row).filter((key) => row[key] !== undefined);
	const names = keys.map(snake).join(', ');
	const values = keys.map((key) => literal(row[key])).join(', ');
	return `INSERT INTO ${table} (${names}) VALUES (${values});`;
}

/** Players are shared across events: the latest ingest's name wins, and nothing cascades from them. */
const upsertPlayer = (row: Row) =>
	insert('players', row).replace(
		/;$/,
		' ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, username = excluded.username;'
	);

/**
 * Writes one Tournament, whole: the people it names, then `DELETE` it (cascading away anything a
 * previous ingest wrote), then everything again in foreign-key order. Run it twice and nothing
 * changes — which is what makes a rerun a repair.
 */
export function writeStatements(built: BuiltTournament): string[] {
	return [
		...built.players.map(upsertPlayer),
		`DELETE FROM tournaments WHERE id = ${literal(built.tournament.id)};`,
		insert('tournaments', built.tournament),
		...built.rounds.map((row) => insert('tournament_rounds', row)),
		...built.decks.map((row) => insert('tournament_decks', row)),
		...built.deckCards.map((row) => insert('tournament_deck_cards', row)),
		...built.standings.map((row) => insert('standings', row)),
		...built.matches.map((row) => insert('tournament_matches', row))
	];
}

/**
 * `--reparse`: rebuild each deck's derived columns and card rows from its stored text, with no
 * network. Used when `cards.json` moves — a new Set resolves a line that didn't before, and the
 * separator between a Legend's name and subtitle has changed twice already.
 */
export function reindexStatements(
	decks: readonly { guid: string; tournamentId: number; text: string }[],
	cards: readonly Card[]
): string[] {
	return decks.flatMap(({ guid, tournamentId, text }) => {
		const index = indexDeck(guid, tournamentId, text, cards);
		return [
			`UPDATE tournament_decks SET legend_line = ${literal(index.legendLine)}, ram = ${literal(index.ram)}, unresolved = ${literal(index.unresolved)} WHERE guid = ${literal(guid)};`,
			`DELETE FROM tournament_deck_cards WHERE deck_guid = ${literal(guid)};`,
			...index.cards.map((row) => insert('tournament_deck_cards', row))
		];
	});
}

/**
 * `--reparse`, the other half: each event's kind again from its name, for when `kind.ts` gains a rule.
 * Only rows that would change are written, so a run that changes nothing writes nothing.
 */
export function rekindStatements(
	events: readonly { id: number; name: string; kind: string }[]
): string[] {
	return events.flatMap(({ id, name, kind }) => {
		const now = eventKind(name);
		return now === kind
			? []
			: [`UPDATE tournaments SET kind = ${literal(now)} WHERE id = ${literal(id)};`];
	});
}

/** The statements as the file `wrangler d1 execute --file` takes. */
export const toFile = (statements: readonly string[]) => `${statements.join('\n')}\n`;

// ---------------------------------------------------------------------------
// `--check`: is what's stored what we would write?
// ---------------------------------------------------------------------------

/** Columns the database fills in itself, so a stored row has them and a built row doesn't. */
const OWNED = {
	tournaments: { omit: ['ingested_at'], key: ['id'] },
	tournament_rounds: { omit: [], key: ['number'] },
	tournament_decks: { omit: [], key: ['guid'] },
	tournament_deck_cards: { omit: [], key: ['deck_guid', 'card_slug', 'board'] },
	standings: { omit: [], key: ['player_id'] },
	tournament_matches: {
		omit: ['id'],
		key: ['round', 'table_number', 'player_a', 'player_b', 'games_a']
	}
} as const;

export type OwnedTable = keyof typeof OWNED;
export const OWNED_TABLES = Object.keys(OWNED) as OwnedTable[];

/** SELECTs for one Tournament's rows, each by the id. `players` is shared and never compared. */
export function storedQueries(id: number): Record<OwnedTable, string> {
	const n = literal(id);
	return {
		tournaments: `SELECT * FROM tournaments WHERE id = ${n}`,
		tournament_rounds: `SELECT * FROM tournament_rounds WHERE tournament_id = ${n}`,
		tournament_decks: `SELECT * FROM tournament_decks WHERE tournament_id = ${n}`,
		tournament_deck_cards: `SELECT * FROM tournament_deck_cards WHERE tournament_id = ${n}`,
		standings: `SELECT * FROM standings WHERE tournament_id = ${n}`,
		tournament_matches: `SELECT * FROM tournament_matches WHERE tournament_id = ${n}`
	};
}

function canonical(table: OwnedTable, rows: readonly Row[], fromBuilt: boolean): string[] {
	const { omit, key } = OWNED[table];
	const omitted: readonly string[] = omit;
	const keyed: readonly string[] = key;
	return rows
		.map((row) => {
			const entries = Object.entries(row)
				.map(([name, value]) => [fromBuilt ? snake(name) : name, dbValue(value)] as const)
				.filter(([name]) => !omitted.includes(name));
			// A column the built row leaves to its default is absent there and present when stored;
			// compare only what both sides state.
			return Object.fromEntries(entries);
		})
		.map((row) => JSON.stringify(row, Object.keys(row).sort()))
		.sort((a, b) => {
			const k = (text: string) => keyed.map((name) => String(JSON.parse(text)[name])).join('|');
			return k(a).localeCompare(k(b), 'en', { numeric: true }) || a.localeCompare(b);
		});
}

/** Per owned table, how the stored rows differ from the built ones; empty when they match. */
export function diffAgainstStored(
	built: BuiltTournament,
	stored: ReadonlyMap<OwnedTable, readonly Row[]>
): string[] {
	const mine: Record<OwnedTable, readonly Row[]> = {
		tournaments: [built.tournament],
		tournament_rounds: built.rounds,
		tournament_decks: built.decks,
		tournament_deck_cards: built.deckCards,
		standings: built.standings,
		tournament_matches: built.matches
	};
	const differences: string[] = [];
	for (const table of OWNED_TABLES) {
		const next = canonical(table, mine[table], true);
		const prev = canonical(table, stored.get(table) ?? [], false);
		if (JSON.stringify(next) === JSON.stringify(prev)) continue;
		const changed = next.filter((row) => !prev.includes(row)).length;
		differences.push(`${table}: ${prev.length} stored, ${next.length} built, ${changed} differ`);
	}
	return differences;
}
