import { redirect } from '@sveltejs/kit';
import { attemptAuth } from '#lib/server/attempt.js';
import { linkDiscord } from '#lib/server/social-sign-in.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this route reads request-scoped session
// state and can't be rendered at build time.
export const prerender = false;

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) return redirect(302, '/auth/login');

	const accounts = await event.locals.auth.api.listUserAccounts({
		headers: event.request.headers
	});

	return {
		user: event.locals.user,
		hasPassword: accounts.some((account) => account.providerId === 'credential'),
		discordAccountId: accounts.find((account) => account.providerId === 'discord')?.id ?? null
	};
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
	},
	setPassword: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const newPassword = formData.get('newPassword')?.toString() ?? '';

		const failure = await attemptAuth(
			() => auth.api.setPassword({ headers: event.request.headers, body: { newPassword } }),
			'password'
		);
		if (failure) return failure;

		return { success: true, section: 'password' };
	},
	linkDiscord: (event) => linkDiscord(event.locals.auth, event.request.headers),
	unlinkDiscord: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const accountId = formData.get('accountId')?.toString() ?? '';

		// better-auth's own `unlinkAccount` already refuses to remove a user's last remaining
		// account ("You can't unlink your last account") — no separate guard needed here.
		const failure = await attemptAuth(
			() => auth.api.unlinkAccount({ headers: event.request.headers, body: { accountId } }),
			'linked'
		);
		if (failure) return failure;

		return { success: true, section: 'linked' };
	}
};
