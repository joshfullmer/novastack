import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';

/**
 * Shared by `signInDiscord` and `/account`'s `linkDiscord` action — both call a
 * `signInSocial`-shaped better-auth endpoint that either returns an authorization `url` to
 * redirect to, or throws.
 */
async function completeOAuthRedirect(run: () => Promise<{ url?: string }>, section?: string) {
	let url: string | undefined;
	try {
		({ url } = await run());
	} catch (error) {
		if (error instanceof APIError) return fail(400, { message: error.message, section });
		return fail(500, { message: 'Unexpected error', section });
	}
	if (!url) return fail(500, { message: 'Unexpected error', section });
	return redirect(302, url, { external: ['https://discord.com'] });
}

/**
 * Shared by `/auth/login` and `/auth/register` — social sign-in and sign-up are the same
 * better-auth call, there's no separate "register with Discord" flow.
 */
export function signInDiscord(auth: App.Locals['auth']) {
	return completeOAuthRedirect(() =>
		auth.api.signInSocial({
			body: {
				provider: 'discord',
				callbackURL: '/decks',
				// A brand-new sign-up has no `username` yet — the hook-level guard in
				// `hooks.server.ts` would redirect to the picker regardless, but landing there
				// directly skips an unnecessary bounce through `/decks`.
				newUserCallbackURL: '/auth/choose-username',
				// Explicit-only linking (see auth.ts's `disableImplicitLinking`) means the most
				// likely real failure here is "this email already has a password account" —
				// better-auth appends `?error=account_not_linked` to this URL, which
				// `/auth/login` reads to show a targeted message.
				errorCallbackURL: '/auth/login'
			}
		})
	);
}

/** `/account`'s "Link Discord" action — explicit, authenticated linking (see the discord-login
 * map's Notes on why this app never auto-links by email match). */
export function linkDiscord(auth: App.Locals['auth'], headers: Headers) {
	return completeOAuthRedirect(
		() =>
			auth.api.linkSocialAccount({
				headers,
				body: {
					provider: 'discord',
					callbackURL: '/account',
					// `/account` reads `?error=<code>` the same way `/auth/login` does for sign-in
					// failures — the realistic one here is `email_does_not_match` (better-auth
					// requires the linked account's email to match by default; not overridden).
					errorCallbackURL: '/account'
				}
			}),
		'linked'
	);
}
