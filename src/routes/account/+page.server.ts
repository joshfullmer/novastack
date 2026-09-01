import { redirect } from '@sveltejs/kit';
import { attemptAuth } from '#lib/server/attempt.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this route reads request-scoped session
// state and can't be rendered at build time.
export const prerender = false;

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');
	return { user: event.locals.user };
};

export const actions: Actions = {
	updateUsername: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const username = formData.get('username')?.toString() ?? '';

		const failure = await attemptAuth(
			() =>
				auth.api.updateUser({
					headers: event.request.headers,
					body: { username, name: username }
				}),
			'username'
		);
		if (failure) return failure;

		return { success: true, section: 'username' };
	},
	changeEmail: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const password = formData.get('password')?.toString() ?? '';
		const newEmail = formData.get('newEmail')?.toString() ?? '';

		const passwordFailure = await attemptAuth(
			() => auth.api.verifyPassword({ headers: event.request.headers, body: { password } }),
			'email'
		);
		if (passwordFailure) return passwordFailure;

		const failure = await attemptAuth(
			() =>
				auth.api.changeEmail({
					headers: event.request.headers,
					body: { newEmail, callbackURL: '/account' }
				}),
			'email'
		);
		if (failure) return failure;

		return { success: true, section: 'email' };
	},
	deleteAccount: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const password = formData.get('password')?.toString() ?? '';

		// `deleteUser` verifies the password itself when one's supplied in the body — no
		// separate `verifyPassword` call needed, unlike `changeEmail`.
		const failure = await attemptAuth(
			() => auth.api.deleteUser({ headers: event.request.headers, body: { password } }),
			'delete'
		);
		if (failure) return failure;

		return redirect(303, '/');
	}
};
