# Plan: Meta in the site header

Status: **built, at `linked`** (2026-11-19): the header links to Meta; the pages are still `noindex` and out of
the sitemap. The pages live at `/meta/…`. Getting data onto production is `tournaments-rollout.md`; this is only
the header entry and the switch that turns it on.

## The nav item

A new top-level item, not a consolidation. Measured on 2026-11-19: the five links (Cards, Decks,
Collection, Notation, Rules) exactly fill the row at 640px, the narrowest width where it shows (297px of
297px), and have about 350px spare at 1024px. Meta adds about 51px, so it only overflows between 640px and
about 700px. Fix that by moving the hamburger breakpoint from `sm` to `md` (`Nav.svelte`). Nothing existing
is merged or hidden: Notation is a top-level link on purpose (it is for people who haven't found the site
yet), and Collection is a main owner-only page.

- **Shape:** a link with a hover dropdown, like Cards and Decks. The trigger goes to `/meta`; the menu is
  Top decks, Matchups, Card breakdown, Decks, Tournaments. The same group in the hamburger menu.
- **Position:** after Cards and Decks.
- **Naming:** the item stays **Decks**, in the header menu and the sidebar: it is under Meta, which is context
  enough (decided 2026-11-19; "Tournament decks" was tried and reverted).

## The switch

Notation launched with one constant (`NOTATION_LAUNCHED`, `src/lib/notation/launch.ts`) read by everything
that was dark-deployed. Meta gets the same, in `src/lib/meta/launch.ts`. Two stages are worth having,
because linking and indexing are different risks:

| stage    | header link | `noindex` | in sitemap |
| -------- | ----------- | --------- | ---------- |
| `dark`   | no          | yes       | no         |
| `linked` | yes         | yes       | no         |
| `public` | yes         | no        | yes        |

The seven `/meta` pages currently hard-code `noindex`; they read the switch instead. `/meta/tournaments/add`
stays `noindex` and out of the sitemap at every stage. At `public` the sitemap gains `/meta`,
`/meta/matchups`, `/meta/cards`, `/meta/decks` and `/meta/tournaments` (not individual events or decks: they
live in D1 and the sitemap is built at build time). Rollback is setting the stage back.

## Order (the stage is already `linked`, so do step 2 before pushing)

1. Build the nav item and the switch (done, at `linked`). **Don't push yet:** the header now links to pages that
   error until production has the tournament tables, so step 2 comes first. To push earlier, set `dark`.
2. Do the data rollout (`tournaments-rollout.md`).
3. Watch it at `linked` for a while (Worker CPU, D1 `rows_read`). Query results are cached already
   (`src/lib/server/query-cache.ts`, per data center, keyed by `meta_version`); caching whole pages is not
   built, because the pages read per-visitor cookies.
4. Before `public` (and `linked` too, once the header link is live): put crawlers in front of it. Meta's pages
   take a period and filters, so the set of URLs is unbounded and every one is a D1 read. Found the hard way on
   2026-11-20: `meta-externalagent` (Meta's AI crawler) walked `?kind=`/`?ram=`/`?line=` combinations at about
   one request every 2 s, mostly on the `workers.dev` host, and a query-result cache does nothing for it (each
   URL is new).
   - `robots.txt` (`src/routes/robots.txt/+server.ts`): `Disallow: /meta/*?` for everyone, `/meta/` for
     `meta-externalagent`. Advisory, and only once the crawler refetches it.
   - A Cloudflare WAF rule, which runs before the Worker and costs no invocation or D1 read:
     `http.user_agent contains "meta-externalagent"` (any plan), or the dashboard's "Block AI bots". It only
     sees hosts in this zone, not `workers.dev`, which is why that host is turned off (below). The better
     control; the next item is the stand-in until it exists.
   - `blocked-crawlers.ts`, called first in `hooks.server.ts`: a 403 for `meta-externalagent` on `/meta`, before
     any database work. Still a Worker request, so it spares D1 but not the daily request count. A faked
     user-agent walks past it, as it would past the WAF's user-agent rule.
   - `rel="nofollow"` on links that carry a query, and `noindex` on filtered views (`metaNoindex`), so a
     crawler that does honour them stops walking and listing the filters.
   - `workers_dev: false` in `wrangler.jsonc` (done): the `workers.dev` host is outside this zone, so no WAF
     rule sees it, and it was a second copy of every page. One public host, `novastack.gg`.
   - Bounded filters (done): a Legend or Legend line the dataset doesn't have is answered "none" without a
     query (`isPossibleLine`), a `?page=` past the end is served as the last page (`fetchPage`, so counting
     upwards is one key), and an absence (`null`) is never cached. Free text (`?player=`, `?q=`) can't be
     bounded by checking it; that is what a rate limit is for. A rate limit on `/meta`, one per IP, is a cheap
     backstop, and weak against a crawler that spreads across IPs.
   - Watch Worker requests and D1 `rows_read` for a day after each stage change.
5. Set `public`.
