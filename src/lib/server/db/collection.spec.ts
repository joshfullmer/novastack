/**
 * Guards the one thing about the Collection's bulk write that types cannot: **D1 rejects any
 * statement with more than 100 bound parameters**
 * (https://developers.cloudflare.com/d1/platform/limits/).
 *
 * This is a regression test for a real bug. "Add all missing" on the base set is 150 printings,
 * and an upsert binds three values per row, so the original single-statement version sent ~450
 * parameters. D1 rejected the whole write, the optimistic client rolled back, and the symptom was
 * every card flashing to ×1 and then reverting to 0 — with nothing in the types to suggest why.
 *
 * Asserted against real Drizzle SQL rather than against the chunk arithmetic, so it keeps holding
 * if the row shape changes: adding one bound column per row silently lowers how many rows fit.
 */
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import { buildSetQuantitiesStatements } from './collection.js';
import * as schema from './schema.js';

/** D1's documented ceiling — the number this whole module exists to stay under. */
const D1_MAX_BOUND_PARAMS = 100;

/**
 * Drizzle only touches the driver when a statement is *executed*, and these are never executed —
 * `buildSetQuantitiesStatements` hands back builders and the test reads `.toSQL()` off them. So a
 * stub with no behaviour is enough, and the test needs no database.
 */
const db = drizzle({} as D1Database, { schema });

function quantitiesFor(count: number, quantity: number): Map<string, number> {
	return new Map(
		Array.from({ length: count }, (_, index) => [`printing-${index}`, quantity] as const)
	);
}

function parameterCounts(statements: ReturnType<typeof buildSetQuantitiesStatements>): number[] {
	return statements.map((statement) => statement.toSQL().params.length);
}

describe('bulk collection writes stay under D1 limits', () => {
	it('chunks an upsert of the whole base set rather than sending one huge statement', () => {
		// 150 English retail printings in `MS01-WNC` — the real "add all missing" case.
		const statements = buildSetQuantitiesStatements(db, 'user-1', quantitiesFor(150, 1));

		expect(statements.length).toBeGreaterThan(1);
		for (const count of parameterCounts(statements)) {
			expect(count).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS);
		}
	});

	it('chunks deletions too — a bulk clear binds one parameter per printing', () => {
		const statements = buildSetQuantitiesStatements(db, 'user-1', quantitiesFor(472, 0));

		expect(statements.length).toBeGreaterThan(1);
		for (const count of parameterCounts(statements)) {
			expect(count).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS);
		}
	});

	it('stays under the ceiling across the whole plausible range, in both directions', () => {
		// Every set size up to the largest set (472 printings), adds and clears alike. Cheap, and
		// it catches an off-by-one in the chunk arithmetic that a single size would miss.
		for (const size of [1, 2, 32, 33, 34, 99, 100, 101, 150, 472]) {
			for (const quantity of [1, 0]) {
				const statements = buildSetQuantitiesStatements(db, 'user-1', quantitiesFor(size, quantity));
				for (const count of parameterCounts(statements)) {
					expect(count, `size ${size}, quantity ${quantity}`).toBeLessThanOrEqual(
						D1_MAX_BOUND_PARAMS
					);
				}
			}
		}
	});

	it('mixes adds and removals in one batch', () => {
		const mixed = new Map<string, number>();
		for (let index = 0; index < 120; index += 1) mixed.set(`printing-${index}`, index % 2 === 0 ? 1 : 0);

		const statements = buildSetQuantitiesStatements(db, 'user-1', mixed);
		const sql = statements.map((statement) => statement.toSQL().sql);

		expect(sql.some((text) => text.startsWith('delete'))).toBe(true);
		expect(sql.some((text) => text.startsWith('insert'))).toBe(true);
		for (const count of parameterCounts(statements)) {
			expect(count).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS);
		}
	});

	it('builds nothing for an empty request, so the caller can skip the batch entirely', () => {
		expect(buildSetQuantitiesStatements(db, 'user-1', new Map())).toEqual([]);
	});
});
