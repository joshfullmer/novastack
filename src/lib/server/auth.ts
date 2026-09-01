import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { username } from 'better-auth/plugins';
import { getRequestEvent } from '$app/server';
import { getDb } from '#lib/server/db/index.js';
import { sendEmail } from '#lib/server/mail.js';

const authConfig = {
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	emailAndPassword: {
		enabled: true,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail(
				user.email,
				'Reset your password — novastack',
				`<p>Click to set a new password:</p><p><a href="${url}">${url}</a></p>`
			);
		},
		// A reset means "I might not be the only one with access to this account anymore" —
		// signing out other sessions is the safer default.
		revokeSessionsOnPasswordReset: true
	},
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await sendEmail(
				user.email,
				'Verify your email — novastack',
				`<p>Click to verify your email address:</p><p><a href="${url}">${url}</a></p>`
			);
		},
		sendOnSignUp: true,
		autoSignInAfterVerification: true
	},
	user: {
		// The new address only takes effect once its verification link is clicked — reuses
		// `emailVerification.sendVerificationEmail` above, no separate callback needed.
		changeEmail: { enabled: true },
		// No `sendDeleteAccountVerification` callback — deletion is immediate once the password
		// in the request body checks out, no separate email-confirmation step.
		deleteUser: { enabled: true }
	},
	/**
	 * Both explicit, not left to defaults: `enabled` otherwise defaults to `NODE_ENV ===
	 * "production"`, which Wrangler never sets for a deployed Worker — so the default would
	 * silently disable rate limiting in production. `storage: "memory"` (the actual default)
	 * doesn't survive across Workers isolates, so it wouldn't count against the same attacker
	 * twice; "database" persists the counters in D1 instead.
	 */
	rateLimit: {
		enabled: true,
		storage: 'database'
	},
	plugins: [
		// `displayUsername` off: one lowercase handle, no separate cased display copy — see
		// docs/wayfinder/account-actions/tickets/02-username-migration-account-shell.md.
		username({ displayUsername: false }),
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
