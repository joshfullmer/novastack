/**
 * A set's detail page. No longer prerendered — see the comment on `export const prerender`
 * below for why.
 */
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true`. The Retail/Beta tab and "Hide duplicates"
// toggle (`+page.svelte`) read `url.searchParams` reactively via `currentUrl()` — and SvelteKit
// refuses to expose `url.searchParams` *at all* on a prerendered page, not merely "the query
// string is ignored": there is no request to read one from at prerender time, so touching it is
// a hard build error rather than a runtime one. Same fix, same reasoning, as
// `cards/[slug]/+page.server.ts`.
export const prerender = false;

export const load: PageServerLoad = ({ setHeaders }) => {
	// Unlike `/card-art/*` (immutable), this response can change on a re-ingest. Same caching
	// shape as the card detail page for the same reason: `s-maxage` lets Cloudflare's edge cache
	// it instead of hitting the Worker on every view, `stale-while-revalidate` means a redeploy
	// still reaches visitors within the hour rather than needing a manual purge.
	setHeaders({
		'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
	});
};
