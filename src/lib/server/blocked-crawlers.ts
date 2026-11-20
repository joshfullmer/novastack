/**
 * Crawlers turned away from Meta before any database work.
 *
 * `robots.txt` asks `meta-externalagent` (Meta's AI-training crawler, which brings no search traffic) to stay
 * out of `/meta/`, but it only works if the crawler reads and obeys it, and it was walking every filter
 * combination at about one request every two seconds, each a D1 read. This is the enforced half: a 403
 * from the request hook, before `locals.db` exists. The Cloudflare WAF does the same at the edge for free,
 * for requests on this zone's own hosts, and is the better place for it; this covers a WAF rule that isn't
 * set up yet. The user-agent can be faked, so it is a courtesy shield and not a security control.
 *
 * `meta-webindexer` (link previews) is left alone: it is light and it is what makes a shared link unfurl.
 */
const BLOCKED = /meta-externalagent/i;

/** `/meta` and what is under it, not `/meta-old`. */
const inMeta = (pathname: string) => pathname === '/meta' || pathname.startsWith('/meta/');

export const isBlockedCrawler = (userAgent: string | null, pathname: string) =>
	userAgent !== null && BLOCKED.test(userAgent) && inMeta(pathname);
