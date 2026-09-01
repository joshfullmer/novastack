import { redirect } from '@sveltejs/kit';
import { attemptAuth } from '#lib/server/attempt.js';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this route reads request-scoped session
// state and can't be rendered at build time.
export const prerender = false;

export const load: PageServerLoad = (event) => {
	const token = event.url.searchParams.get('token');
	if (!token) return redirect(302, '/auth/forgot-password');
	return { token };
};

export const actions: Actions = {
	resetPassword: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const newPassword = formData.get('newPassword')?.toString() ?? '';
		// Not `event.url.searchParams` — a query-only form `action="?/resetPassword"` resolves
		// by *replacing* the page's whole query string, so `?token=...` never reaches the POST.
		// The token has to travel as its own form field instead.
		const token = formData.get('token')?.toString();

		if (!token) return redirect(302, '/auth/forgot-password');

		const failure = await attemptAuth(() =>
			auth.api.resetPassword({ body: { newPassword, token } })
		);
		if (failure) return failure;

		return redirect(303, '/auth/login?reset=1');
	}
};
