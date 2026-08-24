import type { User, Session } from 'better-auth';
import { createAuth } from '#lib/server/auth.js';
import { getDb } from '#lib/server/db/index.js';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
			auth: ReturnType<typeof createAuth>;
			db: ReturnType<typeof getDb>;
		}

		// interface Error {}
		/**
		 * Only set by `/decks` and `/auth`'s layouts — deliberately absent on the static,
		 * prerendered pages, which never invoke the Worker to check a session.
		 */
		interface PageData {
			user?: User;
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
