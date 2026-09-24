/**
 * The signed-in **hint** cookie.
 *
 * Nav has to know whether to render "Account / Sign out" or "Sign in" on every page — including
 * `/cards`, `/sets` and `/faq`, which are prerendered or edge-cached and so cannot carry
 * per-user data in their responses at all. Only `/auth`, `/decks` and `/account` provide
 * `page.data.user`, which is why every other page showed "Sign in" to signed-in users.
 *
 * This cookie is the cheapest fix that doesn't cost the architecture: **no request**, so a
 * prerendered page stays a static asset, and no per-user data in any cacheable response.
 *
 * **It is a UI hint and never an authentication signal.** It is deliberately readable by client
 * JavaScript (that's the whole point — a pre-paint script in `app.html` reads it before first
 * paint) and it carries a single bit: is someone signed in. No id, no name, no token, nothing
 * worth forging. If a visitor edits it, the only consequence is that Nav offers a link to
 * `/account`, which then does a real server-side session check and redirects them to sign in.
 * Every actual authorization decision still happens server-side, unchanged.
 *
 * Kept in sync by `hooks.server.ts` on every dynamic request, so it self-heals: any real action
 * a user takes — signing in, signing out, loading their decks, a session expiring — corrects it.
 */
import type { Cookies } from '@sveltejs/kit';

export const SIGNED_IN_COOKIE = 'signed-in';

/** A year. The session is the real clock; this only has to outlive it to avoid a stale "Sign in". */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Writes the hint only when it disagrees with the request's own cookie, so a signed-in user's
 * every navigation doesn't carry a pointless `Set-Cookie`.
 */
export function syncSignedInHint(cookies: Cookies, signedIn: boolean): void {
	const current = cookies.get(SIGNED_IN_COOKIE) === '1';
	if (current === signedIn) return;

	if (signedIn) {
		cookies.set(SIGNED_IN_COOKIE, '1', {
			path: '/',
			maxAge: MAX_AGE_SECONDS,
			sameSite: 'lax',
			// Readable by the pre-paint script in `app.html` — see this module's comment for why
			// that is safe, and why this is not a session token.
			httpOnly: false
		});
	} else {
		cookies.delete(SIGNED_IN_COOKIE, { path: '/' });
	}
}
