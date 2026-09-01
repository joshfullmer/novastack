import { redirect } from '@sveltejs/kit';
import { attemptAuth } from '#lib/server/attempt.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this route reads request-scoped session
// state and can't be rendered at build time.
export const prerender = false;

export const load: PageServerLoad = (event) => {
	if (event.locals.user) return redirect(302, '/decks');
	return {};
};

export const actions: Actions = {
	signUpEmail: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const username = formData.get('username')?.toString() ?? '';

		// `name` has no UI of its own — better-auth's core schema requires it regardless of the
		// username plugin, so it's kept in lockstep with `username` rather than surfaced as a
		// second "real name" field. See
		// docs/wayfinder/account-actions/tickets/02-username-migration-account-shell.md.
		const failure = await attemptAuth(() =>
			auth.api.signUpEmail({ body: { email, password, name: username, username } })
		);
		if (failure) return failure;

		return redirect(302, '/decks');
	}
};
