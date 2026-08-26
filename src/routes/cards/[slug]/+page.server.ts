/**
 * The card detail page. No longer prerendered — see the comment on `export const prerender`
 * below for why.
 */
import { error } from '@sveltejs/kit';
import { dataset } from '#lib/cards/index.js';
import { PRINTING_PARAM } from '#lib/cards/schema.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true`. A shared card link can carry `?printing=`,
// selecting a specific printing — and Open Graph tags (read by non-JS crawlers like Discord's,
// which only ever see one static response per URL) need to reflect *that* printing's art, not
// always the Default Printing. A prerendered page is built once, with no query string at all,
// so it can never vary by one; resolving it here costs an in-memory lookup, nothing more —
// there's no database or network I/O on this route to make per-request rendering expensive.
export const prerender = false;

export const load: PageServerLoad = ({ params, url, setHeaders }) => {
	const card = dataset.bySlug.get(params.slug);
	if (card === undefined) error(404, `No card with slug "${params.slug}".`);

	const key = url.searchParams.get(PRINTING_PARAM);
	const printing = card.printings.find((entry) => entry.key === key) ?? card.printings[0];

	// Unlike `/card-art/*` (immutable — a printing id never changes meaning), this response can
	// change: an ingest re-run can fix errata in a card's text. `s-maxage` lets Cloudflare's edge
	// cache it instead of hitting the Worker on every view; `stale-while-revalidate` means a
	// redeploy reaches visitors within the hour rather than needing a manual purge.
	setHeaders({ 'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' });

	return { card, printing };
};
