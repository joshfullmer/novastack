# Plan: Meta in the site header

Status: **planned, not started** (2026-11-19). The pages live at `/meta/…` and are dark: not in the header,
`noindex`, absent from the sitemap. Getting data onto production is `tournaments-rollout.md`; this is only
the header entry and the switch that turns it on.

## The nav item

A new top-level item, not a consolidation. Measured on 2026-11-19: the five links (Cards, Decks,
Collection, Notation, Rules) exactly fill the row at 640px, the narrowest width where it shows (297px of
297px), and have about 350px spare at 1024px. Meta adds about 51px, so it only overflows between 640px and
about 700px. Fix that by moving the hamburger breakpoint from `sm` to `md` (`Nav.svelte`). Nothing existing
is merged or hidden: Notation is a top-level link on purpose (it is for people who haven't found the site
yet), and Collection is a main owner-only page.

- **Shape:** a link with a hover dropdown, like Cards and Decks. The trigger goes to `/meta`; the menu is
  Tier list, Matchups, Card breakdown, Tournament decks, Tournaments. The same group in the hamburger menu.
- **Position:** after Cards and Decks. (Open: first, in front of Cards, if Meta is to lead.)
- **Naming:** the header already has **Decks** (My Decks, Explore). Under Meta, call the decks item
  **Tournament decks**, in the header and the sidebar, so the two never read as the same thing.

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

## Order

1. Build the nav item and the switch dark, and push (nothing shows).
2. Do the data rollout (`tournaments-rollout.md`).
3. Set `linked` and watch it for a while (Worker CPU, D1 `rows_read`; edge caching is the known gap in
   `scale-audit.md` if the numbers ask for it).
4. Set `public`.
