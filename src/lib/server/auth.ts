import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { getDb } from '#lib/server/db/index.js';

const authConfig = {
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	emailAndPassword: { enabled: true },
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
} satisfies Omit<Parameters<typeof betterAuth>[0], 'database'>;

export const createAuth = (d1: D1Database) =>
	betterAuth({
		...authConfig,
		database: drizzleAdapter(getDb(d1), { provider: 'sqlite' })
	});

/**
 * DO NOT USE!
 *
 * This instance is used by the `auth` CLI for schema generation ONLY.
 * To access `auth` at runtime, use `event.locals.auth`.
 *
 * The `null!` here is a deliberate, narrow exception to the project's no-coercion rule: the
 * `auth generate` CLI only introspects `betterAuth`'s config shape to emit `auth.schema.ts` — it
 * never issues a real query, so this value is never dereferenced. There is no way to construct a
 * real `D1Database` outside a Workers runtime to avoid the assertion honestly.
 */
export const auth = createAuth(null!);
