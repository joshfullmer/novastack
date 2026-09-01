import { createAuth, auth } from '#lib/server/auth.js';
import { getDb } from '#lib/server/db/index.js';

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
		}
	}
}

export {};
