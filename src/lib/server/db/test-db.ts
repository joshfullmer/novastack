/**
 * A real SQLite behind the same Drizzle API as D1, for testing data-layer queries.
 *
 * Built from this repo's own migrations (`drizzle/*.sql`, in order), so a test runs against the schema
 * production has, and a column or index a query relies on must really exist. `node:sqlite` is the same
 * engine D1 runs; `drizzle-orm/sqlite-proxy` is the bridge. Only for tests: nothing in the app imports it.
 *
 * What it can't tell you: D1's own limits and billing (rows read, bound-parameter ceiling). Those are
 * measured on the real thing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.js';

const MIGRATIONS = new URL('../../../../drizzle/', import.meta.url);

export function createTestDb() {
	const sqlite = new DatabaseSync(':memory:');
	for (const file of readdirSync(MIGRATIONS)
		.filter((name) => /^\d{4}_.*\.sql$/.test(name))
		.sort()) {
		for (const statement of readFileSync(new URL(file, MIGRATIONS), 'utf8').split(
			'--> statement-breakpoint'
		)) {
			if (statement.trim()) sqlite.exec(statement);
		}
	}

	const db = drizzle(
		async (sql, params, method) => {
			const statement = sqlite.prepare(sql);
			// Rows as arrays of values, which is what the proxy driver reads: objects would lose a column
			// when a join selects two of the same name.
			statement.setReturnArrays(true);
			const bound = params.map((value) => (typeof value === 'boolean' ? Number(value) : value));
			if (method === 'run') {
				statement.run(...bound);
				return { rows: [] };
			}
			// `get()` must return `undefined` for no row, which this callback's type can't express; the data
			// layer reads with `select()`, which is `all`. Refuse rather than quietly return a wrong shape.
			if (method === 'get') throw new Error('test-db: .get() is not supported; use .select()');
			return {
				rows: statement.all(...bound).map((row) => (Array.isArray(row) ? row : Object.values(row)))
			};
		},
		{ schema }
	);
	return { db, sqlite };
}
