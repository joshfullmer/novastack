# Map: Card Database (stage 1)

Label: `wayfinder:map`

## Destination

An implementation-ready spec at `docs/spec/card-database.md` for stage 1: an **art-forward
card database with filters** for the Cyberpunk TCG, sourced from `api.netdeck.gg`. The spec
covers the card/printing domain model, the data ingestion contract, the filter set and its
state model, route structure, and the grid/detail UI behaviour — enough that `/implement`
can build it without further design decisions. No app code is written on this map.

## Notes

**Domain.** Fan-made deckbuilder + card database for the Cyberpunk TCG. Stage 1 is the card
database; the deckbuilder is stage 2 and out of scope — but stage-1 decisions must leave the
seams for it (card identity stable enough for decklists, a printing-selection concept, a
filter-state model reusable in a deck view). Design for it; don't build it.

**Prior research — read first.** `docs/netdeck-api-notes.md` is a thorough, measured survey
of the live API. Treat its decisions as inherited, not re-litigable:

- Mirror images at build time, keyed by `printing_id`; never hotlink (signed URLs, 24h TTL).
- Ship 244w + 488w derivatives; keep 733w originals in a gitignored `mirror/`.
- ThumbHash LQIP inline in the card JSON, with the card's `color` as a zero-byte tier-0.
- Host on Cloudflare Workers static assets.
- The list endpoint strips `printings[]`; card-level `set`/`rarity`/`artist`/`print_number`
  are copies of one chosen printing and can disagree with `printings[]`.

**Attribution — settled.** Mirroring card art follows established fan-database precedent. The
condition is disclosure, so the spec must require it: a persistent "unofficial fan project,
not associated with the publisher" disclaimer, artist credit wherever a printing is shown
(the data carries `artist` per printing), and a link back to the official source. This is a
requirement on the spec, not a question to resolve — no ticket.

**Scale.** 131 cards, 385 printings, 12 sets. The entire dataset is small enough to ship to
the client. Assume client-side filtering unless a ticket disproves it.

**Stack.** SvelteKit 2 / Svelte 5 (runes) / TypeScript / Tailwind v4 / Vitest, pnpm,
`@sveltejs/adapter-cloudflare`. There is no `svelte.config.js` — config lives in
`vite.config.ts`. The repo is not git-init'd yet.

**Skills every session should consult.** `/grilling` and `/domain-modeling` by default;
`/prototype` + `/frontend-design` on prototype tickets; `/sveltekit-svelte5-tailwind` and
`/svelte-core-bestpractices` plus the `svelte` MCP server for anything touching Svelte.

**Plan, don't do.** Tickets resolve decisions. Prototype tickets may write throwaway code —
that code is a thinking aid, not the deliverable.

## Decisions so far

<!-- one line per resolved ticket: gist + link -->

_(none yet)_

## Not yet specified

- **Card detail page.** What it shows, how the printing/variant picker behaves, whether a
  specific printing is deep-linkable. Hangs on the glossary and the grid prototype.
- **Sorting.** Default grid order, which sorts are offered, whether sort joins filter state
  in the URL.
- **Empty, loading, and error states.** Whether a zero-result path is worth designing when
  the whole dataset is local.
- **Perf budget.** Concrete payload targets, above-the-fold eager loading, and the actual
  derivative byte sizes — notes §4 marks those as estimates, never measured.
- **Testing strategy.** What earns a Vitest browser test versus a unit test against a pure
  filter function.
- **Accessibility.** Keyboard operation of the filter controls, announced result counts,
  focus behaviour as the grid re-renders.
- **Ingestion invalidation robustness.** Notes §8 leaves open whether `render-{hash}` rotates
  when art is re-rendered; matters only once the pipeline shape is chosen.
- **Set-code discovery.** `set=set1promos` returns 0 while a `PRM01` card exists — set
  filtering may need codes the API won't enumerate.
- **Spec assembly.** Folding the resolved decisions into `docs/spec/card-database.md` and the
  handoff shape for `/implement`.

## Out of scope

- **The deckbuilder itself** — stage 2. Deck routes, persistence, export formats, and deck
  legality validation are all excluded; only the seams are in scope.
- **IP / redistribution legal review** — settled by precedent and the disclaimer requirement
  above; no terms-of-service analysis on this map.
- **Multi-game support** — `mtg` (32,384 cards) shares the API but not this map's scope
  (notes §8). Stage 1 is `cyberpunk` only.
- **Authenticated endpoints** — `/api/games` returns 401 and token issuance is unknown; a
  public card database doesn't need it.
- **Deploy wiring / CI** — the spec targets Cloudflare Workers, but provisioning the deploy
  is not a stage-1 design decision.
- **Accounts, collection tracking, prices** — no user state in stage 1.
