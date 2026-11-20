import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from './db/test-db.js';
import { createQueryCache } from './query-cache.js';

/** The slice of the Workers Cache API the cache uses, over a Map. */
const fakeCache = () => {
	const store = new Map<string, string>();
	return {
		store,
		match: async (request: Request | string) => {
			const body = store.get(typeof request === 'string' ? request : request.url);
			return body === undefined ? undefined : new Response(body);
		},
		put: async (request: Request | string, response: Response) => {
			store.set(typeof request === 'string' ? request : request.url, await response.text());
		}
	};
};

describe('createQueryCache', () => {
	let db: ReturnType<typeof createTestDb>['db'];
	let pending: Promise<unknown>[];
	const waitUntil = (promise: Promise<unknown>) => void pending.push(promise);
	const settle = () => Promise.all(pending);

	beforeEach(() => {
		({ db } = createTestDb());
		pending = [];
	});

	const setVersion = (version: number) =>
		db.run(
			sql`insert into meta_version (id, version) values (1, ${version}) on conflict (id) do update set version = ${version}`
		);

	it('answers a repeat from the cache without running the query again', async () => {
		const cache = fakeCache();
		const compute = vi.fn(async () => ({ at: new Date(1_700_000_000_000), n: [1, 2] }));
		const first = createQueryCache({ cache, db, waitUntil });
		await first('q', { a: 1 }, compute);
		await settle();

		const again = await createQueryCache({ cache, db, waitUntil })('q', { a: 1 }, compute);
		expect(compute).toHaveBeenCalledOnce();
		// Dates survive the round trip, as they do in a load's own data.
		expect(again).toEqual({ at: new Date(1_700_000_000_000), n: [1, 2] });
	});

	it('does not store an absence', async () => {
		const cache = fakeCache();
		const query = createQueryCache({ cache, db, waitUntil });
		expect(await query('q', 'missing', async () => null)).toBeNull();
		await settle();
		expect(cache.store.size).toBe(0);
	});

	it('keeps different names and arguments apart', async () => {
		const cache = fakeCache();
		const query = createQueryCache({ cache, db, waitUntil });
		expect(await query('q', { a: 1 }, async () => 'one')).toBe('one');
		await settle();
		expect(await query('q', { a: 2 }, async () => 'two')).toBe('two');
		expect(await query('r', { a: 1 }, async () => 'three')).toBe('three');
	});

	it('misses once the data version moves', async () => {
		const cache = fakeCache();
		await setVersion(1);
		await createQueryCache({ cache, db, waitUntil })('q', null, async () => 'old');
		await settle();

		await setVersion(2);
		const next = createQueryCache({ cache, db, waitUntil });
		expect(await next('q', null, async () => 'new')).toBe('new');
	});

	it('reads the version once per request', async () => {
		const queries: string[] = [];
		const counted = createTestDb({ onQuery: (statement) => queries.push(statement) }).db;
		const query = createQueryCache({ cache: fakeCache(), db: counted, waitUntil });
		await Promise.all([query('a', null, async () => 1), query('b', null, async () => 2)]);
		expect(queries.filter((statement) => statement.includes('meta_version'))).toHaveLength(1);
	});

	it('just runs the query when there is no cache', async () => {
		const query = createQueryCache({ cache: undefined, db, waitUntil });
		expect(await query('q', null, async () => 'fresh')).toBe('fresh');
		expect(pending).toHaveLength(0);
	});

	it('just runs the query when the version cannot be read', async () => {
		const cache = fakeCache();
		await db.run(sql`drop table meta_version`);
		const query = createQueryCache({ cache, db, waitUntil });
		expect(await query('q', null, async () => 'fresh')).toBe('fresh');
		expect(cache.store.size).toBe(0);
	});

	it('survives a cache that throws', async () => {
		const broken = {
			match: async () => {
				throw new Error('down');
			},
			put: async () => {
				throw new Error('down');
			}
		};
		const query = createQueryCache({ cache: broken, db, waitUntil });
		expect(await query('q', null, async () => 'fresh')).toBe('fresh');
		await expect(settle()).resolves.toBeDefined();
	});

	it('passes the query’s own error through', async () => {
		const query = createQueryCache({ cache: fakeCache(), db, waitUntil });
		await expect(
			query('q', null, async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
	});
});
