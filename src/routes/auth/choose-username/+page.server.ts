import { redirect } from '@sveltejs/kit';
import { attemptAuth } from '#lib/server/attempt.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this route reads request-scoped session
// state and can't be rendered at build time.
export const prerender = false;

/** Best-effort starting point only — `username`'s own validation/normalization on submit is
 * what actually decides whether it's usable, this just saves retyping a close match. */
function suggestUsername(name: string) {
	return name.toLowerCase().replace(/[^a-z0-9_.]/g, '');
}

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');
	if (event.locals.user.username) return redirect(302, '/decks');
	return { suggestion: suggestUsername(event.locals.user.name) };
};

export const actions: Actions = {
	setUsername: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const username = formData.get('username')?.toString() ?? '';

		const failure = await attemptAuth(() =>
			auth.api.updateUser({
				headers: event.request.headers,
				body: { username, name: username }
			})
		);
		if (failure) return failure;

		return redirect(302, '/decks');
	}
};
