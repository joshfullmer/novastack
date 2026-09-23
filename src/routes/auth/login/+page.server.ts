import { redirect } from '@sveltejs/kit';
import { attemptAuth } from '#lib/server/attempt.js';
import { signInDiscord } from '#lib/server/social-sign-in.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this route reads request-scoped session
// state and can't be rendered at build time.
export const prerender = false;

export const load: PageServerLoad = (event) => {
	if (event.locals.user) return redirect(302, '/decks');
	return {};
};

export const actions: Actions = {
	// One field, either a username or an email — people forget which they registered with. `@`
	// is a sound, not just convenient, discriminator: Better Auth's username plugin enforces
	// `/^[a-zA-Z0-9_.]+$/` on every path that can produce a username — signup, `/update-user`
	// (`src/routes/account/+page.server.ts`), and `/sign-in/username` itself, which re-validates
	// the *input* against that same regex before ever querying the database (checked directly
	// against `node_modules/better-auth/dist/plugins/username/index.mjs`, and live: hand-editing
	// a row's `username` to an email-shaped string in D1 still gets rejected on sign-in). So no
	// stored username can ever contain `@`, regardless of how the row was created — including
	// the handful of production rows backfilled by hand when this plugin was retrofitted
	// (`docs/wayfinder/account-actions/tickets/02-username-migration-account-shell.md`).
	signIn: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const identifier = formData.get('identifier')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		const failure = await attemptAuth(() =>
			identifier.includes('@')
				? auth.api.signInEmail({ body: { email: identifier, password } })
				: auth.api.signInUsername({ body: { username: identifier, password } })
		);
		if (failure) return failure;

		return redirect(302, '/decks');
	},

	signInDiscord: (event) => signInDiscord(event.locals.auth)
};
