/**
 * A route rather than a `static/robots.txt` file, purely so the `Sitemap:` line can use `ORIGIN`
 * instead of hardcoding the domain a second place — see `sitemap.xml`'s own `+server.ts` for why
 * `ORIGIN` and not `url.origin` here too.
 */
import { ORIGIN } from '$app/env/private';

export const prerender = true;

export function GET() {
	const body = `User-agent: *
Disallow:

Sitemap: ${ORIGIN}/sitemap.xml
`;

	return new Response(body, { headers: { 'content-type': 'text/plain' } });
}
