# Plan: launching Meta (linking it from the site header and letting search find it)

Status: **planned, not started** (2026-11-19). The pages live at `/meta/…` (`docs/spec/tournaments.md`
§6). Today they are deployed but dark: not in the header, `noindex`, absent from the sitemap. This is how
that changes. The data rollout comes first and is its own runbook: `tournaments-rollout.md`.

## The switch

Notation launched this way and it worked (`NOTATION_LAUNCHED`, `src/lib/notation/launch.ts`): one constant
that every dark-deployed surface reads, so deploying and launching are separate steps and launching is a
one-line commit. Meta gets the same, with **two stages** because linking and indexing are different risks:

| stage    | header link | `noindex` | in sitemap | what it is for                                            |
| -------- | ----------- | --------- | ---------- | --------------------------------------------------------- |
| `dark`   | no          | yes       | no         | today                                                     |
| `linked` | yes         | yes       | no         | real visitors, no search traffic yet; watch it for a week |
| `public` | yes         | no        | yes        | search engines may list it                                |

`src/lib/meta/launch.ts`: `export const META_STAGE = 'dark' as 'dark' | 'linked' | 'public'`, plus
`META_LINKED` and `META_INDEXED` derived from it. `/meta/tournaments/add` (the bookmarklet page) is
`noindex` at every stage and never in the sitemap.

## Work that is safe to push dark (do first)

1. **The switch.** Replace the hard-coded `noindex` on the seven `/meta` pages (the `(board)`, `decks` and
   `[id]` layouts, the list, the card page, `add`) with `noindex={!META_INDEXED}`; `add` keeps a plain `noindex`.
2. **The sitemap.** When `META_INDEXED`, add the stable paths: `/meta`, `/meta/matchups`, `/meta/cards`,
   `/meta/decks`, `/meta/tournaments`. Not individual events, decks or cards: they live in D1 and the sitemap is
   built at build time, so listing them is a separate (dynamic sitemap) job, and worth doing only if events
   turn out to be what people search for.
3. **The header entry** (`Nav.svelte`), shown when `META_LINKED`. Proposal: a link with a hover dropdown,
   the same shape as Cards and Decks, **after Decks**: trigger goes to `/meta`; menu is Tier list, Matchups,
   Card breakdown, Tournament decks, Tournaments. Same group in the hamburger menu. The link row is "already
   at its limit" at `lg` (the nav's own comment), so check it at 1024px and 1100px with the new item before
   committing to a dropdown; fall back to a plain link if it doesn't fit.
4. **A name for the decks.** The header already has **Decks** (My Decks, Explore). Under Meta, "Decks" means
   decks that were played in tournaments. Rename the sidebar item and the header menu entry to
   **Tournament decks** so the two never read as the same thing.
5. **A smoke test.** An e2e that loads each `/meta` route and asserts it renders (no 5xx, a heading), and
   tolerates an empty database, since e2e runs against whatever the local D1 holds. There is none today.
6. **Empty states.** Open each page with a kind/period/size filter that matches nothing and with no events
   at all, and check each says so rather than showing an empty table. (Kinds and periods are now URL-driven,
   so a stale link is easy to produce.)

## Gates before flipping `dark` → `linked`

All of these, in order:

1. The data rollout is done and pushed (`tournaments-rollout.md` steps 1–5), and `pnpm melee --promote --check`
   exits 0: production holds what local does.
2. `pnpm melee --list`: nothing important is still waiting. An event that isn't ready is fine; a big one
   that was skipped is not.
3. The current meta (WNC) has enough decks that the tier list isn't noise: tiers need 5 decks
   (`MIN_DECKS`) and the matchup matrix shows `n=` under every cell. If most cells are `n<5`, wait.
4. Production spot-check, by hand: `/meta`, `/meta/matchups`, `/meta/cards`, `/meta/decks` (open a deck
   in the pane), `/meta/tournaments` and one event's Bracket tab, with a kind filter on and a phone-width
   window. The period menu should default to WNC.
5. The header fits (item 3 above), on a phone and at 1024px.

## Flip, watch, then index

1. Set `META_STAGE = 'linked'`. Push. Check the header on production.
2. Watch it for about a week: the Worker's CPU and D1 `rows_read` in Cloudflare (the scale audit's numbers
   are from a laptop; D1's own meter is **UNVERIFIED**), errors, and what people click. If a page is
   heavy, **edge caching** is the known gap (`scale-audit.md`, row 3): the data only changes at an ingest, so a
   few minutes of `s-maxage` on `GET /meta/**` is safe. Build it here if the numbers say so.
3. Set `META_STAGE = 'public'`. Push. Submit the sitemap if Search Console is used for the site.
4. Announce (the Discord link is already in the header).

**Rollback** is one line: set the stage back. The header link goes, `noindex` returns, the sitemap drops the
paths. Pages already listed by a search engine fall out as it recrawls; nothing in the data changes.

## After launch (not part of it)

- **Link in from where people already are**, behind `META_LINKED`: a card's page (`/cards/[slug]`) saying
  "played in N% of tournament decks" and linking to `/meta/cards/[slug]`; the home page; Explore. These
  will bring more traffic than the header link does.
- A dynamic sitemap for events, if they turn out to matter.

## Decisions I need from you

1. **Two stages (`linked` then `public`), or one switch like Notation?** I recommend two.
2. **A dropdown in the header, or a plain "Meta" link?** Depends on the fit check; I recommend the dropdown
   if it fits, because Cards and Decks already work that way.
3. **"Tournament decks"** for the decks item?
4. **Edge caching before `linked`, or only if the numbers ask for it?** I recommend waiting for numbers.
