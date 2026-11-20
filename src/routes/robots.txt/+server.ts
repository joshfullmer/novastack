/**
 * A route rather than a `static/robots.txt` file, purely so the `Sitemap:` line can use `ORIGIN`
 * instead of hardcoding the domain a second place — see `sitemap.xml`'s own `+server.ts` for why
 * `ORIGIN` and not `url.origin` here too.
 */
import { ORIGIN } from '$app/env/private';

export const prerender = true;

export function GET() {
	// Meta's filters (`?kind=`, `?ram=`, `?line=`, …) multiply into thousands of URLs that are each a
	// database read and a cache miss, and show a crawler nothing a page without them doesn't. Every
	// agent is kept off them; Meta's AI crawler, which brings no search traffic, is kept off /meta.
	const body = `User-agent: meta-externalagent
Disallow: /meta/

User-agent: *
Disallow: /meta/*?

Sitemap: ${ORIGIN}/sitemap.xml
`;

	return new Response(body, { headers: { 'content-type': 'text/plain' } });
}
