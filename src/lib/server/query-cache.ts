/**
 * A cache in front of the meta pages' database reads (`docs/spec/tournaments.md` §6, "Cost control").
 *
 * What is cached is a query's *result*, not a rendered page: the pages read per-visitor cookies (the
 * sidebar, the List/Gallery toggles), so a response cached by URL would hand one visitor's layout to the
 * next. The queries take only a period and filters, so their results are the same for everyone.
 *
 * Stored in the Workers Cache API (`caches.default`): free, no binding, but **per data center**, so each
 * one pays one miss per query before it warms. Entries are keyed by `meta_version`, which `pnpm melee`
 * bumps on every write: a new ingest makes every old entry unreachable everywhere at once, so nothing is
 * purged and nothing is ever stale. The TTL below only bounds how long an unreachable entry lingers.
 *
 * An absence (`null`, a deck or event that doesn't exist) is not stored: it is one cheap lookup, and the ids
 * that don't exist are as many as anyone cares to ask for, so storing them would only fill the cache with
 * junk from whoever counts upwards.
 *
 * The cache is an optimisation and never a dependency. A missing cache (tests, a dev server without
 * one), an unreadable version (the table is not migrated yet) or a failing `match`/`put` all fall through
 * to the query itself; only the query's own error ever reaches the caller.
 */
import { parse, stringify } from 'devalue';
import { eq } from 'drizzle-orm';
import type { Db } from './db/tournaments.js';
import { metaVersion } from './db/schema.js';

/** Runs `compute` unless this version of the data already answered `name` for `args`. */
export type QueryCache = <T>(name: string, args: unknown, compute: () => Promise<T>) => Promise<T>;

/** Bounds how long a superseded entry occupies space; correctness comes from the key, not this. */
const TTL_SECONDS = 24 * 60 * 60;

/** A hostname that can never resolve: a Cache API key must be a URL, and this one is nobody's. */
const KEY_ORIGIN = 'https://query-cache.invalid';

/** Without a cache, every call is just the query. */
export const uncached: QueryCache = (_name, _args, compute) => compute();

async function digest(text: string): Promise<string> {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Best effort: a value that won't serialise, or a `put` that fails, just means the next call misses. */
async function store(cache: Pick<Cache, 'put'>, key: Request, value: unknown) {
	try {
		await cache.put(
			key,
			new Response(stringify(value), {
				headers: { 'cache-control': `public, max-age=${TTL_SECONDS}` }
			})
		);
	} catch {
		// Not worth failing a request that already has its answer.
	}
}

export function createQueryCache(options: {
	cache: Pick<Cache, 'match' | 'put'> | undefined;
	db: Db;
	/** Lets the `put` finish after the response is sent (`platform.context.waitUntil`). */
	waitUntil: (promise: Promise<unknown>) => void;
}): QueryCache {
	const { cache, db, waitUntil } = options;
	if (!cache) return uncached;

	// Read at most once per request, and only when something is actually cached.
	let version: Promise<number | null> | undefined;
	const currentVersion = () =>
		(version ??= db
			.select({ version: metaVersion.version })
			.from(metaVersion)
			.where(eq(metaVersion.id, 1))
			.then((rows) => rows[0]?.version ?? 0)
			.catch(() => null));

	return async (name, args, compute) => {
		const current = await currentVersion();
		if (current === null) return compute();

		// Hashed so a long filter can't push the key past a URL's length limit.
		const key = new Request(
			`${KEY_ORIGIN}/meta/${current}/${name}/${await digest(JSON.stringify(args))}`
		);

		try {
			const hit = await cache.match(key);
			if (hit) return parse(await hit.text());
		} catch {
			// An unreadable entry is a miss.
		}

		const value = await compute();
		if (value !== null && value !== undefined) waitUntil(store(cache, key, value));
		return value;
	};
}
