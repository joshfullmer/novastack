# Implementation notes — card database (stage 1)

What the build measured, and where it diverged from `docs/spec/card-database.md`. The spec says
_what_; this says what actually happened when it was built.

Built against the source API on **2026-08-20/21**: 133 cards, 389 printings, 12 API sets.

---

## 1. Measurements the spec asked for

§12 listed these as "not yet measured". They are now.

| quantity                                   | spec estimate        | measured                      |
| ------------------------------------------ | -------------------- | ----------------------------- |
| `cards.json` raw                           | "low hundreds of KB" | **277 KB**                    |
| `cards.json` gzipped                       | "tens gzipped"       | **41.3 KB**                   |
| `landing.json`                             | —                    | **1.7 KB**                    |
| Derivatives, total                         | ~83 MB               | **64 MB** across 1,167 files  |
| 244w                                       | ~20–30 KB each       | **18 KB** avg (7.0 MB total)  |
| 488w                                       | ~60–80 KB each       | **50 KB** avg (18.8 MB total) |
| 733w                                       | not estimated        | **95 KB** avg (36.0 MB total) |
| Mirrored originals (`mirror/`, gitignored) | 46 MB                | **47 MB**                     |
| Landing-page JS payload                    | —                    | **< 150 KB**, asserted in e2e |

This closes the open questions in `netdeck-api-notes.md` §4 ("actual derivative byte sizes") and
the first two bullets of spec §12.

**The `/` payload assertion is a real test**, not a note: `e2e/landing.spec.ts` fails if the
landing page's JS crosses 150 KB, which is what stops the dataset import creeping into the shared
layout and undoing the code-split.

### Assertions verified against live data

Every claim the spec derived by hand held exactly:

- Color forms **4 contiguous runs** in the Base Set retail sequence → `Red, Yellow, Green, Blue`.
- Card type forms **16 runs, 4 per color** → `Legend, Unit, Gear, Program`.
- `ramProvided` is uniform across Legends (`2`).
- `Red/Red/Blue` admits **57 of 133** cards.
- `{X}` markup: **102 occurrences** of exactly 9 tokens.
- 12 API sets collapse to **8** printed Set Identifiers; **11** cards are Set-Exclusive.
- Printing keys match the spec's worked examples: `MS01-WNC-005a`, `MS01-WNC-β144`.

---

## 2. Deviations from the spec

Each of these is a decision the spec did not anticipate, not a corner cut.

### 2.1 The Set facet is over the 8 printed identifiers, not the 12 API sets

§4.5 says the facet "must not be a flat 12-value list". It is a flat-_zero_-value list of API
sets: the facet is the **eight printed Set Identifiers**, grouped base vs derivative.

`CONTEXT.md` is definitive that a Set is what the card prints, that there are eight, and that the
API's retail/beta split "is its own invention". The landing page's own stats line says `8 sets`.
A facet over 12 would contradict the number the site advertises.

**Cost:** "beta printings only" is not directly expressible. The Iconic rarities that live only on
beta printings are still reachable through the Rarity facet, which is what §4.5 actually cared
about. If a print-treatment filter turns out to be wanted, it is a separate toggle, not a reason
to expand the Set facet to twelve.

### 2.2 The facet is called "Eddiable", not "Sellable"

§4.2 labels it Sellable. `CONTEXT.md` defines **Eddiable** and explicitly lists "sellable" under
_Avoid_. The glossary wins over both the spec's label and the API's `is_eddiable`.

It is also a three-state control (Any / Yes / No) rather than a toggle, because "no filter" has to
be expressible and a two-state toggle cannot express it.

### 2.2b Terminology: `Color`, and `Tag`

`CONTEXT.md` lists **colour** under `_Avoid_` for the term Color, so the US spelling is the
project's word — in identifiers, in prose, and in every visible label.

The glossary's Classification entry also listed **tag** under `_Avoid_`, which was wrong: the
printed rules call these **Tags**. That entry has been corrected and renamed, and the interface
says Tags. The data model keeps `classifications` where it mirrors the API field name.

### 2.3 The Legend color cycle follows the derived color order

§4.4 specifies the cycle `none → Red → Blue → Green → Yellow`. The control instead cycles through
`dataset.colorOrder`, which is `Red, Yellow, Green, Blue`.

Hardcoding a second color order beside the one §2.5 goes to the trouble of deriving and asserting
would be exactly the competing source of truth the spec objects to elsewhere.

### 2.4 Card art lives at `/card-art/`, not `/cards/`

§3 specifies `static/cards/{printing_id}/{width}.webp`. It is `static/card-art/…`.

`/cards/` is the **route** namespace. The immutable `Cache-Control` rule has to match the art and
must not match the prerendered `/cards/[slug]` pages — a year of `immutable` on an HTML page means
a redeploy never reaches anyone who has already visited — and `/cards/*` is the only glob shape
that is unambiguously supported in a Cloudflare `_headers` file. Keying by printing id is
unchanged.

### 2.4b Cloudflare Pages needs an explicit `_routes.json`

The spec chose **Workers static assets** (§7), and `wrangler.jsonc` targets it. But the adapter
switches to its Pages branch whenever `CF_PAGES` is set, and on that branch it enumerates every
static file into `_routes.json` — which is capped at 100 rules. Measured: the adapter emits 99
rules and **drops 1,206**, warning that this "will cause unnecessary function invocations". On
Pages, that means asset requests invoke the Function and become billable, defeating §1.3 entirely.

`routes.exclude` in `vite.config.ts` replaces the enumeration with seven globs — 8 rules total.
This is only expressible because the card art sits under its own `/card-art/` prefix (§2.4)
rather than inside the `/cards/` route namespace: one glob covers all 1,167 images without also
swallowing the 133 prerendered card pages.

The option is Pages-only and ignored on Workers, so the primary target is unaffected — verified:
a Workers build still emits `.assetsignore` and no `_routes.json`.

### 2.5 Density is local state, not URL state

§6 says the URL is the only source of truth. Density is not a filter — it is how zoomed-in the
reader likes their grid — so it lives in component state and a shared link carries the query rather
than the sender's zoom level. Every actual filter, search and sort is in the URL.

### 2.6 Numeric ranges need one token the spec did not specify

§4.3 requires a `+ none` toggle and requires an edge-parked thumb to serialise as absent. Those two
rules together leave "has a value at all, no bounds" unexpressible, so the range grammar has a
`has` token:

```
?cost=2-4        2 ≤ cost ≤ 4, nulls excluded
?cost=2-4,none   that range, or no cost at all
?cost=has        has a cost, no bounds
(absent)         no filter
```

`+ none` defaults to **on**, because the bare `/cards` URL shows every card.

### 2.7 Five cards have no rules text, not one

§8.6 says "one card has no rules text at all". That is `Rebecca — Having a Moment`, whose
`rules_text` is null at source. But once the §2.4 flavour split runs, **four more** cards end up
with no rules paragraphs — the three `[Flavour]`-tagged cards and `emergency-atlus`, which is
nothing but a quoted flavour line. The empty state covers all five.

### 2.8 A `data-hydrated` marker on the grid

The prerendered grid _looks_ interactive — every chip is in the static HTML — while no handler is
attached and the query string has not been read. That window is invisible and it made the e2e
suite flaky. The boundary is now observable, which is also the hook a pre-paint narrowing script
(§7's rejected-but-reversible option) would key off.

---

## 3. Two bugs worth remembering

### The URL is not `page.url` under shallow routing

`goto(url, { shallow: true })` **does not update `page.url`.** Shallow means "the URL changed but
the page did not", so SvelteKit pushes the history entry, leaves `page.url` on the loaded page, and
exposes the new URL at `page.shallow.url`.

Spec §6 says to read `page.url.searchParams` and §6 also says to update with `shallow: true`.
Together those two instructions produce a grid whose address bar updates and whose contents never
do — filters appear to work only after a reload. `src/lib/filters/shallow.ts` exists solely to
name this trap; every URL read goes through it.

This is also why the e2e tests assert the **rendered result** before the URL. A test that checked
only "the URL changed" would have passed against the broken build.

### Prerendered pages cannot read a query string

SvelteKit throws on `url.searchParams` during prerendering. That is not an obstacle to §7's
"prerender wide, narrow on hydration" decision — it is that decision, enforced. Both `/cards` and
`/cards/[slug]` read the query string only when `browser` is true.

---

## 4. Things the implementation added

- **`scripts/ingest.ts` also mirrors images.** `image_url` is signed with a 24-hour TTL and
  re-minted per request, so the only moment it is usable is the moment the record is fetched.
  Splitting data ingest from image mirroring would mean fetching all 133 records twice.
- **`pnpm ingest:data`** skips images and reuses the mirrored ThumbHashes, for data-only reruns.
- **`generatedAt` records when the data last _changed_, not when ingest last ran.** Verified: two
  consecutive `pnpm ingest` runs produce byte-identical `cards.json` and `landing.json`, and
  re-fetch zero images. Without this, every weekly run would rewrite the timestamp, and §2.7's
  "opens a PR if the snapshot changed" would open one every Monday regardless — a PR that says
  nothing changed is a PR nobody reads.
- **Node runs the ingest scripts directly.** Node 24 strips TypeScript natively, so there is no
  build step and no `tsx`. The consequence is that anything `scripts/` imports must use `.ts`
  relative specifiers; app-only modules use `#lib/…js` subpath imports.
- **`cards.json` is imported as a string (`?raw`) and `JSON.parse`d.** An object import would make
  `tsc` infer a 277 KB literal type, and parsing one string is cheaper at runtime than evaluating
  an equivalent object literal.
- **`pnpm-workspace.yaml` declares build approvals under two keys.** pnpm 11 reads `allowBuilds`,
  pnpm 10 reads `onlyBuiltDependencies`, and neither understands the other's. It also needs a
  `packages` field the moment the file exists — pnpm 10 fails the install with "packages field
  missing or empty" without it, which broke a Cloudflare build while pnpm 11 locally did not care.
- **`paths.relative: false`.** SvelteKit's default relative paths make prerendered HTML disagree
  with the hydrated app (`./cards/v-streetkid` vs `/cards/v-streetkid`). This site is served from
  the root of its own domain and does not need the portability.

---

## 5. Still open

The spec's own open questions stand, minus the two this build answered by choosing
(§2.1 the Set grouping presentation, §2.5 hero rotation — a fixed curated seven). Unchanged:

1. **The project's name.** `novastack` is still the repo name used as a wordmark.
2. **Whether `flavorText` is separately searchable.** It is currently not searchable at all. The
   audit's "flavour isn't filter-worthy" verdict rested on the field being null, which was wrong —
   the flavour was misfiled inside `rules_text` and there are 5 cards' worth of it.
3. **Loading and error states** beyond the zero-result case and a styled 404.
4. **Format rotation.** Still no cycle data in the source API.
5. **Whether the image render hash rotates.** The weekly ingest is the backstop; it has not been
   observed changing yet because it has only run once.
