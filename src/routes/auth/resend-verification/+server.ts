import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// `+server.ts` doesn't inherit a parent layout's page options, so this needs its own override.
export const prerender = false;

/**
 * A plain `+server.ts` action, not a page's form action: the verification banner can appear on
 * any dynamic route (`/decks`, `/account`, ...), not just one page's own actions. No `fail()`
 * available outside a page action, so failures (rate-limited, already verified) round-trip as a
 * query param instead of an unhandled 500.
 */
export const POST: RequestHandler = async (event) => {
	const { auth } = event.locals;
	const formData = await event.request.formData();
	const returnTo = formData.get('returnTo')?.toString() || '/';

	if (!event.locals.user) return redirect(303, returnTo);

	/**
	 * Routed through `auth.handler` rather than calling `auth.api.sendVerificationEmail`
	 * in-process: better-auth's built-in per-path rate limiter (and origin check) live in the
	 * router's request pipeline, not on the bare `api.*` call — calling `api.*` directly, as
	 * this app's other actions do, skips that pipeline entirely and the configured rate limit
	 * config quietly does nothing. See
	 * docs/wayfinder/account-actions/tickets/03-email-verification-flow.md.
	 */
	const response = await auth.handler(
		new Request(new URL('/api/auth/send-verification-email', event.url.origin), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: event.request.headers.get('cookie') ?? '',
				// The synthetic request has no browser-set Origin for better-auth's origin-check
				// middleware to read — we're proxying on behalf of the already-authenticated
				// session this same event belongs to, so assert our own origin here.
				origin: event.url.origin
			},
			body: JSON.stringify({ email: event.locals.user.email })
		})
	);

	if (!response.ok) return redirect(303, `${returnTo}?resend-error=1`);
	return redirect(303, `${returnTo}?resent=1`);
};
