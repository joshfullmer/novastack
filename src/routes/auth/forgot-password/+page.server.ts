import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this route reads request-scoped session
// state and can't be rendered at build time.
export const prerender = false;

export const load: PageServerLoad = (event) => {
	if (event.locals.user) return { user: event.locals.user };
	return {};
};

export const actions: Actions = {
	requestReset: async (event) => {
		const { auth } = event.locals;
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';

		/**
		 * Routed through `auth.handler` rather than `auth.api.requestPasswordReset` directly —
		 * same reason as the email-verification resend action
		 * (docs/wayfinder/account-actions/tickets/03-email-verification-flow.md): better-auth's
		 * built-in rate limiter and origin check only run through the router, not the bare
		 * `api.*` call. `/request-password-reset` already has a 3-per-60s special rule.
		 */
		const response = await auth.handler(
			new Request(new URL('/api/auth/request-password-reset', event.url.origin), {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: event.url.origin
				},
				body: JSON.stringify({ email, redirectTo: '/auth/reset-password' })
			})
		);

		/**
		 * better-auth's own handler already returns the same generic message whether or not the
		 * email exists (constant-time, no enumeration) — the only thing that can distinguish a
		 * real failure here is infrastructure (rate limited, network). Still generic either way:
		 * a distinguishable "you're being rate limited" message would itself leak information
		 * about request volume against a specific address.
		 */
		if (!response.ok) return fail(429, { message: 'Too many requests — try again in a minute.' });

		return { success: true };
	}
};
