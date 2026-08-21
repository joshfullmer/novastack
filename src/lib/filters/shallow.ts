/**
 * Reading the URL under shallow routing.
 *
 * `goto(url, { shallow: true })` deliberately **does not update `page.url`**. Shallow means "the
 * URL changed but the page did not", so SvelteKit pushes the history entry, leaves `page.url`
 * pointing at the page that is actually loaded, and exposes the new URL at `page.shallow.url`.
 *
 * That is the trap this module exists for: reading `page.url.searchParams` after a shallow
 * update gives you the URL you started on. The address bar updates, the browser Back button
 * works, and the filters appear to do nothing until a reload.
 *
 * `page.shallow` is `null` on a normal navigation and on first load — including when someone
 * opens a shared filtered link — and popstate restores it correctly, so this one expression is
 * right in every case.
 */
import { page } from '$app/state';

/** The URL the address bar is actually showing. */
export function currentUrl() {
	return page.shallow?.url ?? page.url;
}
