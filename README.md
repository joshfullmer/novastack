# novastack

An unofficial, art-forward card database for the Cyberpunk TCG, built from card data on
`api.netdeck.gg`. Browse and filter every card; the deckbuilder is stage 2.

**Unofficial fan project. Not associated with or endorsed by the publisher.** Card names, art and
rules text belong to their respective owners.

SvelteKit 3 · Svelte 5 (runes) · TypeScript · Tailwind v4 · Valibot · Cloudflare Workers static
assets. Everything prerenders.

---

## Quickstart

```sh
pnpm install
pnpm dev
```

The build never touches the network — it reads a committed snapshot. You only need `pnpm ingest`
when refreshing the data.

| script             | does                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `pnpm dev`         | dev server                                                             |
| `pnpm build`       | build + prerender every route (133 card pages, `/cards`, `/`)          |
| `pnpm preview`     | serve the production build                                             |
| `pnpm check`       | `svelte-check` over `src`, `scripts` and `e2e`                         |
| `pnpm lint`        | Prettier + ESLint                                                      |
| `pnpm test:unit`   | Vitest — the pure core, plus assertions against the committed snapshot |
| `pnpm test:e2e`    | Playwright against a built app, desktop and mobile                     |
| `pnpm test`        | both                                                                   |
| `pnpm ingest`      | refetch the source API, mirror images, rewrite the snapshot            |
| `pnpm ingest:data` | same, skipping images (reuses mirrored ThumbHashes)                    |

---

## How it fits together

```
scripts/ingest.ts            the only thing that touches the network
  ├─ lib/netdeck.ts          slug enumeration + detail fetch (the list endpoint strips printings)
  ├─ lib/images.ts           mirror → 3 derivative tiers → ThumbHash
  └─ lib/stable-json.ts      sorted keys, tab indent: drift must read as a reviewable diff

src/lib/cards/
  vocabulary.ts              closed value sets (Color, Card Type, Keyword, Rarity)
  sets.ts                    the curated Set Identifier map — the API does not expose it
  schema.ts                  the two Valibot schemas: the API's shape, and ours
  rules-text.ts              five markup systems → structured segments (pure)
  normalize.ts               API shape → our model (pure)
  derive.ts                  color/type order, RAM per Legend, set counts (pure)
  assertions.ts              the checks that fail the build (pure)
  dataset.ts                 the runtime view: search haystack, lookups, facet domains
  cards.json                 generated, committed — 277 KB / 41 KB gzipped
  landing.json               generated, committed — stats + 7 hero cards, 1.7 KB
  index.ts                   parses the snapshot once, at module scope

src/lib/filters/
  predicate.ts               the predicate tree + evaluate() → Match[] (pure)
  budget.ts                  the colored RAM budget: admits(budget, card) (pure)
  sort.ts                    comparators, nulls always last (pure)
  state.ts                   URL ⇄ FilterState ⇄ predicate tree
  shallow.ts                 reading the URL under shallow routing — read its doc comment
```

Most of the risk sits in pure functions, which is deliberate: `evaluate`, `admits`, the sort
comparators, the rules-text segmenter and every ingest assertion are testable without a browser.

---

## Things that will bite

- **A null is a distinct bucket and never zero.** `power: 0` is real on 9 cards; `power: null`
  means the stat does not apply, as it does on all 27 Programs. No bound ever admits null — each
  numeric control carries an explicit `— N` toggle for the null bucket.
- **RAM means two opposite things.** A Legend _provides_ RAM; everything else _requires_ it. The
  source API uses one field for both, so the model splits it into `ramProvided`/`ramRequired`.
- **Never read the card-level `rarity` / `artist` / `set` / `print_number`.** They are copies of
  one printing, and one card in four has a printing that contradicts them. Ingest discards them.
  See `docs/adr/0002-discard-the-flattened-printing-fields.md`.
- **`page.url` does not update under shallow routing.** Read `currentUrl()` from
  `#lib/filters/shallow.js` instead. This one shipped as a bug first.
- **Prerendered pages cannot read a query string.** `/cards` prerenders unfiltered and narrows on
  hydration; that is the trade, not a defect.
- **Never set `run_worker_first`**, and never route assets through the Workers Caching API. Both
  make asset requests billable, and asset requests are the only traffic this site has at volume.

---

## Refreshing the data

`pnpm ingest` fetches every card from the detail endpoint, asserts every assumption this project
makes about the source API, mirrors any changed art, and rewrites the snapshot. A violated
assertion **fails the run** — the source API is undocumented and has been observed changing within
hours, so a failure means a decision needs revisiting, not that a check needs relaxing.

A weekly workflow does this and opens a PR if the snapshot moved, so drift arrives as a diff.

Image mirroring lives inside ingest because `image_url` is signed with a 24-hour TTL and re-minted
per request: the only moment it is usable is the moment the record is fetched. Originals stay in a
gitignored `mirror/`, so any tier can be regenerated offline.

---

## Deployment

**Cloudflare Workers Builds owns deploys.** The repo is connected on the Cloudflare side, so a
push to `main` builds and deploys automatically. There is deliberately no deploy job in
`ci.yml` — two paths racing on the same push means last-write-wins decides what is live.

The consequence is worth stating plainly: **CI does not gate the deploy.** Workers Builds clones,
installs, builds and ships regardless of whether `verify` went red. A failing schema gate marks
the commit, but it does not stop the release.

If you want production gated, the lever is **branch protection with required status checks** on
`main`. That blocks the merge, and Workers Builds only ever builds what lands — so the gate is
restored without a second deploy path. One dashboard setting rather than a second pipeline.

Manual deploys still work and bypass everything: `pnpm exec wrangler deploy`.

Never set `run_worker_first`, and never route assets through the Workers Caching API. Both make
asset requests billable, and asset requests are the only traffic this site has at volume.

---

## Documentation

| document                             | holds                                                     |
| ------------------------------------ | --------------------------------------------------------- |
| `CONTEXT.md`                         | the domain glossary — definitive on terminology           |
| `docs/spec/card-database.md`         | the stage-1 spec                                          |
| `docs/implementation-notes.md`       | measurements, and where the build diverged from the spec  |
| `docs/adr/`                          | why slug is the card id; why the flattened fields are cut |
| `docs/research/facet-cardinality.md` | the measured audit behind every facet verdict             |
| `docs/netdeck-api-notes.md`          | the original API survey                                   |
