import { createAuth, auth } from '#lib/server/auth.js';
import { getDb } from '#lib/server/db/index.js';
import type { QueryCache } from '#lib/server/query-cache.js';

/**
 * Plugin-aware session/user types — the plain `User`/`Session` exports from `better-auth` don't
 * know about the `username` plugin. `auth.$Infer` is a type-only property (no runtime
 * dereference), so this is safe even though `auth` itself is the CLI-only, undereferenceable
 * instance from `#lib/server/auth.js`.
 */
type Session = (typeof auth)['$Infer']['Session'];

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: Session['user'];
			session?: Session['session'];
			auth: ReturnType<typeof createAuth>;
			db: ReturnType<typeof getDb>;
			/** Only on the public reads (`public-routes.ts`); see `query-cache.ts`. */
			cached: QueryCache;
		}

		// interface Error {}
		/**
		 * Only set by `/decks` and `/auth`'s layouts — deliberately absent on the static,
		 * prerendered pages, which never invoke the Worker to check a session.
		 */
		interface PageData {
			user?: Session['user'];
		}
		// interface PageState {}
		interface Platform {
			env: {
				/** The deckbuilder's D1 database — accounts, decks, likes. */
				DB: D1Database;
			};
			/** Absent when no cache is available (some dev setups). */
			caches?: { default: Cache };
			/**
			 * Not `context`, its deprecated alias: a `waitUntil` through it let a 32 KB cache `put` be cut
			 * off when the response ended (seen under `wrangler dev`).
			 */
			ctx?: { waitUntil(promise: Promise<unknown>): void };
		}
	}
}

export {};
