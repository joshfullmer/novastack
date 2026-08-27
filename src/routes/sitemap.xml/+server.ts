/**
 * A static, build-time sitemap — every card, the one set, and the app's other stable content
 * routes. Prerendered like everything else here, so it costs nothing to serve.
 *
 * Deliberately excludes `/decks/*`: public decks are user-generated and churn constantly, with
 * none of the lasting value that makes indexing worth it — see `.scratch/starter-decks`'s sibling
 * SEO effort notes, or just: nobody is searching Google for someone's brewed deck by name.
 *
 * Uses `ORIGIN` rather than `url.origin` on purpose — during prerendering, `url.origin` is
 * SvelteKit's internal prerender-crawler placeholder, not the real domain (the same reason
 * `+layout.server.ts` passes `ORIGIN` down for Open Graph tags instead of trusting the request).
 */
import { ORIGIN } from '$app/env/private';
import { snapshot } from '#lib/cards/index.js';

export const prerender = true;

const STATIC_PATHS = ['/', '/cards', '/sets', '/explore', '/syntax'];

export function GET() {
	const paths = [
		...STATIC_PATHS,
		...snapshot.cards.map((card) => `/cards/${card.slug}`),
		...snapshot.sets.map((set) => `/sets/${set.id}`)
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `\t<url><loc>${ORIGIN}${path}</loc></url>`).join('\n')}
</urlset>
`;

	return new Response(body, { headers: { 'content-type': 'application/xml' } });
}
