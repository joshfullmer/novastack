import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this route reads request-scoped session
// state and can't be rendered at build time.
export const prerender = false;

export const load: PageServerLoad = (event) => {
	if (event.locals.user) return redirect(302, '/decks');
	return {};
};

/** Runs a Better Auth call and turns its failure into a form `fail`, never an unhandled throw. */
async function attempt(run: () => Promise<unknown>) {
	try {
		await run();
	} catch (error) {
		if (error instanceof APIError) return fail(400, { message: error.message });
		return fail(500, { message: 'Unexpected error' });
	}
}

export const actions: Actions = {
	signInEmail: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		const failure = await attempt(() => auth.api.signInEmail({ body: { email, password } }));
		if (failure) return failure;

		return redirect(302, '/decks');
	},
	signUpEmail: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const name = formData.get('name')?.toString() ?? '';

		const failure = await attempt(() => auth.api.signUpEmail({ body: { email, password, name } }));
		if (failure) return failure;

		return redirect(302, '/decks');
	}
};
