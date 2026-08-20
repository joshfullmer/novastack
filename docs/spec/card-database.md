# Spec — Card database (stage 1)

An unofficial, art-forward card database for the Cyberpunk TCG, sourced from `api.netdeck.gg`.
This document is implementation-ready: every design decision it records has been made, and the
places where one hasn't are collected under [Open questions](#open-questions).

**Scope.** Browse and filter every card. Stage 2 is the deckbuilder and is out of scope, but the
seams for it are specified where they cost nothing. A Scryfall-style query language is a later
stage with its own design work; stage 1 ships filter controls and builds the seam a parser can
target.

**Rationale lives elsewhere.** This spec says _what_; the reasoning is in
`docs/adr/`, `docs/research/facet-cardinality.md`, and `docs/netdeck-api-notes.md`.
Terminology is defined once in `CONTEXT.md` and used here without redefinition.

---

## 1. Hard constraints

1. **No type coercion.** `as`, `!`, and other assertions are forbidden. Types are _earned_ by
   parsing at boundaries and letting inference flow outward. Where a shape can't be proven,
   express it in the schema.
2. **Never trust the source API's shape.** It is undocumented, silently ignores unknown query
   params, and has been observed changing within hours. Every assumption is asserted at build
   time and fails the build when violated.
3. **Static everything.** All routes prerender. Worker script invocations are the only metered
   resource on the target host; static asset requests are free and unlimited.
4. **Never hotlink card images.** Source image URLs are signed with a 24-hour TTL.

---

## 2. Data pipeline

### 2.1 Source

`https://api.netdeck.gg/api/cards/cyberpunk`. Two endpoints matter:

| endpoint                  | use                                                        |
| ------------------------- | ---------------------------------------------------------- |
| `GET ?limit=100&offset=N` | slug enumeration only — **strips `printings[]`**           |
| `GET /{slug}`             | the real record; slug is the only accepted key (UUIDs 404) |

Ingest must **hit the detail endpoint per card**. Concurrency ≤ 8 with **retry and backoff, and a
content-type check** — an HTML error page in place of JSON is a realistic response and will crash a
naive `.json()`.

### 2.2 Shape

A committed build-time snapshot, written by `pnpm ingest`, run on demand. The build never touches
the network.

```
scripts/ingest.ts          fetch → parse → normalize → parse → write
src/lib/cards/schema.ts    valibot schemas + inferred types
src/lib/cards/cards.json   generated, committed
src/lib/cards/index.ts     parses the JSON once at module scope; what the app imports
```

Imports use `#lib/cards/index.js` — Node subpath imports with **mandatory extensions**. The writer
emits stable output (sorted keys, fixed indentation, trailing newline) or the reviewable-diff
rationale collapses into noise.

### 2.3 Two schemas

```
fetch  →  v.parse(NetdeckCardSchema, raw)   ← the API's shape; catches drift with a field-level message
       →  normalize()
       →  v.parse(CardSchema, normalized)   ← our model; the single source of app types
       →  write cards.json
```

Types come from `v.InferOutput<typeof CardSchema>` — never hand-maintained, never generated from
the data's accidents. Valibot is a **runtime dependency**: coercion is banned, so `v.parse` is the
only route from JSON to a typed value. The app parses once, at module scope.

### 2.4 Normalization rules

**Discard the flattened printing fields.** The API copies one printing's `rarity`, `artist`, `set`,
`print_number`, and `image_url` onto the card. All five are dropped — they can contradict the
printings the card actually contains, which makes a rarity filter silently wrong. See ADR 0002.

**`printings[0]` is the Default Printing**, guaranteed by ingest. Model it as a non-empty tuple so
the type carries the guarantee:

```ts
printings: v.tupleWithRest([PrintingSchema], PrintingSchema); // [Printing, ...Printing[]]
```

**Split RAM by card type.** One API field means opposite things: a Legend _provides_ RAM, everything
else _requires_ it. Emit `ramProvided` and `ramRequired`, never a shared `ram`.

**Derive keywords from `rules_text`.** The `keywords[]` field is empty on every card; the real
keywords are `{Brace}` markup in the rules text. Nine tokens: `Play`, `Spend`, `Blocker`, `Attack`,
`Quick`, `Go Solo`, `Defeated`, `Call`, `Adrenaline`.

**Emit rules text as structured segments**, a valibot discriminated union of `text`, `keyword`,
`classification`, `cardRef`, `nameFragment`, `symbol`, and `reminder`. The renderer becomes a
mapping from segment type to component, holding no game knowledge and no regexes. Rules text
carries five markup systems:

| markup                                                  | rule                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `{X}`                                                   | keyword; closed set of 9; **19 of 102 occurrences are mid-sentence** |
| ALL-CAPS in quotes matching a real card name            | `cardRef` — link it                                                  |
| ALL-CAPS in quotes not matching a card                  | `nameFragment` — style, don't link                                   |
| ALL-CAPS outside quotes matching a known classification | `classification` — link it                                           |
| unmatched ALL-CAPS                                      | plain text; **this is what stops a future unknown being mis-styled** |
| `€` / `☆`                                               | `symbol` → inline icon (eurodollars, Street Cred)                    |
| parenthetical after a keyword                           | `reminder` — de-emphasise                                            |

Quoting is inconsistent: mostly straight ASCII quotes, curly on one card. Handle both.

**Split flavour text out.** `flavor_text` is null on every card because the flavour is _misfiled
inside `rules_text`_ — sometimes tagged `[Flavour]`, sometimes a trailing quoted sentence-case line.
One card contains nothing but flavour. Emit three fields:

```
rulesText      structured segments, flavour removed
flavorText     the extracted flavour
rawRulesText   the untouched original string
```

The raw string is retained deliberately: the split heuristic is fragile, so a misclassification must
be recoverable and re-splittable offline without re-fetching.

### 2.5 Derived data

Ingest computes and writes these rather than the app hardcoding them. Each is _current data, not a
rule_, so each gets an assertion.

| derived         | rule                                                                                          | assertion                                     |
| --------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Colour order    | order colours first appear in base-set collector-number sequence → `Red, Yellow, Green, Blue` | colour forms exactly **4 contiguous runs**    |
| Card-type order | same method → `Legend, Unit, Gear, Program`                                                   | type forms exactly **16 runs** (4 per colour) |
| RAM per Legend  | max `ramProvided` across Legends → `2`                                                        | `ramProvided` is **uniform** across Legends   |
| Stats constant  | card / printing / set counts, for the landing page                                            | —                                             |

**Printed Set Identifier map.** Curated, because the API does not expose it — `set.code` is a
slugified set _name_. The printed form is `<Category> - <Set Code> [<Cycle>]`.

| API `set.code`                    | Category | Set Code | Cycle |
| --------------------------------- | -------- | -------- | ----- |
| `welcometonightcityretail`        | `MS01`   | `WNC`    | A     |
| `welcometonightcitybeta`          | `MS01`   | `WNC`    | A     |
| `theheistretailstarterdeck`       | `SD01`   | `HEI`    | A     |
| `theheistbetastarterdeck`         | `SD01`   | `HEI`    | A     |
| `embracingpowerretailstarterdeck` | `SD02`   | `EBP`    | A     |
| `embracingpowerbetastarterdeck`   | `SD02`   | `EBP`    | A     |
| `mercdemodeck`                    | `PRM`    | `DD1`    | A     |
| `arasakademodeck`                 | `PRM`    | `DD2`    | A     |
| `boxtoppersretail`                | `PRM`    | `WNC`    | A     |
| `boxtoppersbeta`                  | `PRM`    | `WNC`    | A     |
| `prereleasebeta`                  | `PRR01`  | `WNC`    | —     |
| `PRM01`                           | `PRM01`  | —        | —     |

Twelve API sets collapse to **eight** printed identifiers, because retail and beta share one.
Components can be absent — model all three as optional-but-asserted rather than assuming a uniform
grammar. **Neither component identifies a set alone**: `WNC` spans three categories, `PRM` spans
three sets.

### 2.6 Assertions

The build fails on any of these:

- Unique slugs; **zero duplicate names** (this is what makes a Card equal a mechanical identity).
- Slug stability against the previous snapshot.
- `printings[0].id === selected_printing_id`; `printings` non-empty.
- `external_id === 'cb-' + slug`.
- Every `{X}` is one of the 9 known keywords.
- Every `cardRef` segment resolves to a real slug; every `classification` segment matches the known
  list.
- **Every always-empty field is still empty** — `keywords[]`, `finish`, `subname`, `flavor_text`, and
  `legality` constant. If one starts carrying values, our derivation has become a competing source of
  truth and the decision must be revisited.
- Every API set code has a map entry; `<Category>-<SetCode>-<collectorNumber>` is unique across all
  printings.
- The derived-ordering assertions in §2.5.

### 2.7 Refresh and CI

Two workflows:

1. **Schema gate** — parses the committed `cards.json` against the schema and **blocks the merge** on
   failure. Because the snapshot is a static committed artifact, passing here means it passes
   everywhere, forever.
2. **Weekly ingest** — runs `pnpm ingest` and opens a PR if the snapshot changed. Drift arrives as a
   reviewable diff with no cadence to remember. This is also the backstop for notes §8's open
   question about whether the image render hash rotates: a full weekly re-ingest catches changes a
   hash-diff heuristic would miss.

The dataset is **not stable** — it moved 131 → 133 cards and 385 → 389 printings within hours on
2026-08-20. Treat every count in this document as a snapshot.

---

## 3. Images

Mirror at build time, keyed by `printing_id` (the UUID, not the collector number — see ADR 0001's
reasoning on renumbering). The DB stores `printing_id` and `source_image_url`; **never** the signed
`image_url`.

```
mirror/{printing_id}.webp                  733w originals, gitignored
static/cards/{printing_id}/{244,488,733}.webp
```

**Three tiers**, which overrides notes §4's two-tier decision. Measured against the real grid at a
1600px viewport:

| columns | rendered tile | tier     |
| ------- | ------------- | -------- |
| 8–12    | 90–142px      | 244w     |
| 4–6     | 194–298px     | 488w     |
| 2–3     | 300–609px     | **733w** |

Large-format browsing is a supported use, and at 609px both smaller tiers upscale. Cost is roughly
83 MB of derivatives.

Aspect ratio is a hard **733:1024** across every image — hardcode it, zero layout shift.

**Placeholders.** Card `color` paints instantly as a zero-byte tier 0, then a ThumbHash (~25 bytes,
inline in the snapshot) on hydration, then the real image cross-fades on load. ThumbHash rather than
BlurHash because every image has an alpha channel. The cached-image trap is mandatory: check
`img.complete` in an effect, or the blur never clears for cached images.

**Cache headers.** `Cache-Control: public, max-age=31536000, immutable` — the
`{printing_id}/{width}` path is content-addressed enough to justify it.

---

## 4. Filter engine

### 4.1 Shape

A **pure predicate tree**, isolated from Svelte, independently testable:

```
controls → PredicateTree → evaluate(dataset, tree) → Match[]
```

`Match` is `{ card, printing }` — the evaluator returns the **printing that matched**, a witness
rather than a boolean, because the grid shows the matching art. Where several printings match, prefer
the Default Printing if it qualifies, else the first that does.

The tree shape is not decoration: a later query-language parser must target the same evaluator. Sort
travels inside the same state model rather than being bolted on afterwards.

`evaluate` holds no Svelte state and no URL knowledge, so a stage-2 deck view can instantiate its own
filter state over its own dataset scope.

### 4.2 Facets

Ten facets plus text search. **OR within a facet, AND across facets, no per-facet toggle** —
intersection hunting is deliberately deferred to the query language.

| facet                  | control                                            | notes                                                           |
| ---------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| Colour                 | chips, tinted with the card's own colour           | 4 values, near-even split                                       |
| Type                   | chips                                              | 4 values; gates whether Power and RAM apply                     |
| Cost                   | dual-thumb range, 1–9                              | null on 17 Legends                                              |
| RAM                    | dual-thumb range, 1–6, plus the budget input below | 57% of cards are RAM 2 — weak alone                             |
| Keywords               | chips                                              | 9 tokens, 75 of 133 cards; parsed from rules text               |
| Tags (classifications) | searchable list, not chips                         | 39 values, long tail, mean 1.73/card                            |
| Power                  | dual-thumb range, 0–15                             | **null on all 26 Programs**; `0` is real on 9 cards             |
| Set                    | grouped list                                       | see §4.5                                                        |
| Rarity                 | chips                                              | **9 values read off `printings[]`**, not the 6 visible on cards |
| Sellable               | toggle                                             | 98.5% predictable from Type; kept because scarcity is the point |

**Text search** covers name, subname, and `rulesText` — **rules only, not `rawRulesText`**, or
searching "night" matches flavour prose as though it were a game effect. The corpus is 14.6 KB with a
261-word vocabulary: in-memory substring matching, no index. Normalize punctuation and em dashes
(`V — StreetKid`).

Search appears on both `/` and in the grid header. It needs no second mechanism: the landing bar
navigates to `/cards?search=…` and the grid reads it like any other filter state.

### 4.3 Nulls

**A null is a distinct bucket and never zero.** A bound never admits null. Each nullable numeric
control carries an explicit **`+ none`** toggle labelled with the count it admits, so the rule is
visible rather than an invisible behaviour that silently drops 43 cards.

Ranges use a dual-thumb control because a single `≤ N` thumb cannot express "power ≥ 10". A thumb
parked at a domain edge means _unbounded_ and serializes as absent, so "no filter" and "full range"
collapse to one canonical state.

### 4.4 Colored RAM budget

Three **Legend colour slots**, cycling through none → Red → Blue → Green → Yellow. Colours alone
determine the budget because every Legend provides the same RAM of its own colour, so
`Red/Red/Blue → Red 4, Blue 2`. Three clicks, illegal budgets unreachable.

One admission rule covers every card type — _is this card usable in a deck of this colour identity?_

```ts
budget[card.color] > 0 &&
	(card.cardType === 'Legend' || (card.ramRequired ?? 0) <= budget[card.color]);
```

A colour with no budget is excluded entirely, Legends included. On-colour Legends **remain** in
results, because the slots declare colours rather than cards — the actual Legend is still to be
chosen, so showing the candidates is useful. Verified: `Red/Red/Blue` admits 57 of 133.

RAM is a **threshold, not a budget** — clearing the bar admits unlimited copies. `admits` is a pure
function so stage 2 inherits it. `ramProvided` of null counts as 0.

### 4.5 Printing-level facets

Set and Rarity live on printings, so they quantify over the array: `card.printings.some(...)`. Two
consequences:

- The grid still lists **Cards**, one tile each, but a card matching through a non-default printing
  shows _that_ printing's art plus a collector-number badge. This is what makes the three rarities
  that exist only on non-default printings reachable at all.
- Because every retail set has a beta twin, **set filters trigger art-swapping constantly** — far more
  than rarity filters do.

The Set facet must not be a flat 12-value list: that presents a starter deck as a peer of the game's
only real release. Group by base vs derivative. Note **11 cards are Set-Exclusive** — they exist only
in derivative products — so "show me the base set" legitimately excludes real cards, which is worth
surfacing.

---

## 5. Sorting

**Default: Colour → Card Type → Cost → Name**, using the derived colour and type orders from §2.5.

Collector-number order already produces perfect colour and type grouping within the base set; the
explicit sort was chosen anyway so that cost orders within each colour+type block, giving a readable
curve. `Set → Collector Number` is consequently **not reachable** in stage 1.

**Selectable sorts: Cost, Power, Name**, each applying across the whole result set and ignoring the
default's grouping. **Nulls always sort last** — one rule everywhere. This bites: `power` is null on
43 of 133 cards, so a Power sort parks nearly a third of the grid at the end.

Sort is URL state — `?sort=cost-desc`, direction as a suffix so one key carries one concept — with
the default as an **absent** param.

---

## 6. URL and state

**The URL is the only source of truth**, search box included. One code path, no possibility of two
truths diverging. Read via `page.url.searchParams` from `$app/state`; `page.url` is a `ReadonlyURL`,
so build the next URL from `new URL(page.url.href)`.

**Encoding:** comma-joined per-facet params — `?color=red,blue&type=unit`. A cleared filter is an
**absent** param, never an empty one, so each filter combination has exactly one canonical URL.
Numeric ranges use explicit bounds (`?cost=1-4`).

**Updates use shallow routing**, which in SvelteKit 3 means `goto` — not the deprecated
`pushState`/`replaceState`:

```ts
goto(url, { shallow: true }); // chip click — new history entry, so back is filter-undo
goto(url, { shallow: true, replace: true }); // search, behind a ~250 ms debounce
```

No `load` depends on the URL, so this runs no data fetching, resets no scroll, and loses no focus.
Note shallow routing **does** fire `beforeNavigate` / `onNavigate` / `afterNavigate` in v3 — filter on
the `shallow` property so a chip click isn't mistaken for a page change.

**Valibot parses the URL too.** `searchParams.get()` returns `string | null` and coercion is banned,
so a `FilterStateSchema` parses `URLSearchParams` into the typed inputs the predicate tree consumes.
Unknown facet values and malformed ranges are **dropped, not thrown** — a mangled shared link degrades
to a wider result set rather than an error page.

**Results are `$derived`; nothing is stored.**

```
page.url.searchParams → v.parse(FilterStateSchema) → predicate tree → evaluate(dataset)
```

No memoization at this scale — stated explicitly so nobody optimizes it later without measuring.

**Reset.** The bare `/cards` URL shows every card; "no filters" and "filters matching everything" are
the same state and deliberately indistinguishable. A "clear all" affordance appears whenever any param
is present, implemented as a `goto` with `shallow: true` rather than a plain `<a href="/cards">` —
in v3 a link to the current location triggers `refreshAll()`.

Per-facet params are **replaced** by `?q=` when the query language ships, not maintained alongside it.
Whether old links survive that transition is a commitment for that effort.

---

## 7. Routes and rendering

Every route prerenders. Worker invocations approach zero.

| route           | rendering        | contents            |
| --------------- | ---------------- | ------------------- |
| `/`             | prerendered      | Landing page — §8.1 |
| `/cards`        | prerendered      | The database — §8.2 |
| `/cards/[slug]` | prerendered ×133 | Card detail — §8.3  |

A **shared nav component** in the root layout spans every route. Set is a filter, not a route.

**First paint of a filtered link.** `/cards` prerenders with **all** tiles and narrows on hydration, so
a shared filtered link briefly shows everything. This is _hydration latency, not load latency_ — the
data is local; static HTML simply cannot know the query string. Rejected alternatives: a pre-paint
inline script (a second filter implementation that would be right for simple facets and silently wrong
for RAM, search and printing-level matching), a shell-only prerender (penalises the common case), and
SSR (meters every visit). The chosen option is the only reversible one — the pre-paint script can be
added later as a pure enhancement.

**Delivery.** The dataset is **bundled**, not fetched: hydration is what we want earliest and one
request beats a round trip. The parse lives at **module scope** in `#lib/cards/index.ts` — never in a
`load`, which would run on both server and client _and_ serialize the dataset into the HTML for
hydration.

**Import the dataset from the route modules, not the root layout.** `/cards` and `/cards/[slug]` import
it; `/` must not, or the landing page downloads everything to render a search box. Vite code-splits per
route, so this holds only while the import stays out of the shared layout.

Accepted, bounded duplication: prerendered tile markup and the bundled JSON carry the same facts —
roughly 40 KB of HTML plus ~30 KB of JSON, gzipped. That is what buys instant first paint and
crawlability.

**Host.** Cloudflare Workers static assets, adapter passed to the `sveltekit()` plugin in
`vite.config.ts` (there is no `svelte.config.js` in v3). **Never set `run_worker_first`** — it makes
asset requests billable. **Never route assets through the Workers Caching API** — those bill at the
Worker rate. `adapter-cloudflare@8` needs wrangler ≥ 4.67.0, and `platform.context` is now
`platform.ctx`.

---

## 8. Interface

### 8.1 Landing page (`/`)

**Art as hero.** A fanned collage of **seven** real card images emerging from behind the nav, with the
wordmark, a one-line description, and the search field overlaid below. Reference:
`docs/research/landing-layout.jpg`.

- Seven, not eight — an odd count gives the fan a focal centre card.
- **Interleave the colours** (`R B G Y R B G`, Yellow centred). Naive selection picks from dataset
  order, which begins with all 29 Red cards and yields a monochrome spread.
- **Legends make the best hero art** — character portraits read at a glance where Gear and Programs
  don't.
- The art must be near-full opacity with no blur and a gradient that starts transparent. Heavily
  overlaid, the collage stops selling what the site is.
- **The cards link to `/cards/[slug]`.** Only the curated slugs are needed, so `/` still imports no
  dataset, and the links are static-to-static. As links they need real `alt` text, a `title`, a visible
  focus ring, and a hover lift — nothing about a background collage suggests it's clickable. Layer
  `pointer-events` deliberately: the gradient and the text block sit above the fan and must not swallow
  clicks.
- The stats line (`133 cards · 389 printings · 8 sets`) comes from the **build-time constant** in
  §2.5, since `/` cannot import the dataset to count them — and the counts drift.

The wordmark is currently `novastack`, from the repo name. See [Open questions](#open-questions).

### 8.2 Card database (`/cards`)

A header band over a grid, with a persistent detail pane. Reference:
`docs/research/card-grid-layout.jpg`.

- **Header.** Search as the hero, full width; result count; a clear-all that appears only when filters
  are active.
- **Row 1 — categorical.** Colour chips, Type chips, Keyword chips.
- **Row 2 — numeric and scoping.** Cost / Power / RAM ranges, Sellable, the Legend colour slots, the
  density control.
- **Disclosure.** Tags, Rarity, Sets behind a "More filters" toggle.
- **Right pane, 320px, persistent.** The selected card, large. Selecting a tile **never navigates**.

**Tiles are pure art — no caption.** With a density control and a detail pane, a caption is redundant.
The grid's job is _recognition_; the pane's job is _reading_. The only tile text is a collector-number
badge, and only when the shown art is a non-default printing.

**Density is a column count**, starting at 8, stepping by 2, range 2–12; `+` increases the count. Tiles
stretch to fill (`repeat(N, minmax(0, 1fr))`). Two mandatory guards: **floor the derived tile width at
0**, and **clamp the column count by viewport** — a fixed 8 columns is nonsense at 390px.

The categorical/numeric split into rows reads better than a strict importance ranking. Tags belong in
the disclosure as a **searchable list**, not chips.

### 8.3 Card detail (`/cards/[slug]`)

Prerendered per card. Serves three roles: the shareable card URL, the mobile detail view, and the
full-size art view. Over and above the pane it adds:

1. **Larger art**, using the 733w tier — the printed card readable at native resolution. This is the
   reason to open the page.
2. **A printings gallery**, substantial rather than a chip row, each entry showing set, rarity, artist
   and collector number.
3. **Flavour text and per-printing attribution**, which the 320px pane has no room for.

**The printing chooser is a flat list** — every printing, 2 to 6 per card. Accepted cost: **100 of 133
cards are pure retail/beta mirrors of a single art**, so most entries render an identical image. Only
33 cards have more than one artist, and a/b art treatments occur on **exactly one card**. The
mitigation is informational: entries are labelled with set, collector number and rarity, so they differ
by metadata even when the image doesn't — the user is choosing a _printing_, not an art.

**Printing deep-links** use a query param on the 133 prerendered pages, not 389 per-printing routes
(which would be SEO duplication, and would duplicate identical art for 100 cards):

```
/cards/v-streetkid?printing=MS01-WNC-005a
/cards/v-streetkid?printing=MS01-WNC-β144
```

The key is `<Category>-<SetCode>-<collectorNumber>` from §2.5 — unique across all printings. The
collector number is **verbatim, β included**: an identifier that doesn't match the printed card is worse
than a percent-encoded one, and β cannot be reconstructed from the set code (11 prerelease printings
carry none). The UUID remains canonical for storage and image paths; this is a second, URL-facing key.

**Back-navigation needs no work.** Filters live in query params, so browser history returns you to the
narrowed grid.

### 8.4 Navigation

One shared component, so it cannot drift. **Cards** is live; **Decks**, **Sets** and **Rules** render as
dimmed text with a superscript `soon` and **no `href`** — signalling direction without offering
clickable 404s.

### 8.5 Mobile

Below a breakpoint the grid's detail pane **disappears** and tapping a card navigates to
`/cards/[slug]`; filters collapse behind a single button; columns clamp to 2–3. The three-pane desktop
layout fails badly on a phone — measured at 390px, the header consumed ~350px of 844 and the fixed pane
crushed the grid to a ~55px sliver. A phone needs a different composition, not a squeezed one. This is
what makes the detail route earn its keep rather than duplicating the pane.

The landing fan is seven cards wide at desktop and needs its own narrow treatment.

### 8.6 Rules text rendering

All five markup systems from §2.4 are styled. Three are **interactive**, each reusing a mechanism that
already exists:

| segment        | action                    |
| -------------- | ------------------------- |
| keyword        | `/cards?keywords=blocker` |
| classification | `/cards?tags=arasaka`     |
| cardRef        | `/cards/[slug]`           |

`reminder` and `symbol` stay inert. Reminder text is de-emphasised (smaller, dimmer, italic) so the
effect reads before the explanation. Newlines become real paragraph breaks — 60 of 132 cards have them.
One card has no rules text at all and needs an empty state.

---

## 9. Attribution

Required, not optional:

- A persistent **"Unofficial fan project. Not associated with or endorsed by the publisher"** line. The
  landing page is its primary home.
- **Per-printing artist credit** wherever a printing is shown in detail.
- A link back to the official source.

---

## 10. Accessibility

- Every filter control is keyboard-operable, including the dual-thumb ranges (two focusable inputs
  sharing a track) and the cycling colour slots.
- The result count is announced on change via a polite live region — the grid narrowing silently is
  invisible to a screen reader.
- Focus must survive filtering. Shallow routing already avoids the focus loss a full navigation causes.
- Hero cards, being links, need visible focus rings — they are not decoration.
- Tile art carries the card's display name as `alt`; the collector-number badge is supplementary, not a
  replacement.
- Colour is never the only carrier of meaning: colour chips are labelled, not just tinted.

---

## 11. Testing

The architecture is deliberately shaped so most of the risk sits in pure functions:

| target                                                                                  | kind    |
| --------------------------------------------------------------------------------------- | ------- |
| `evaluate(dataset, tree)` — every facet, combination semantics, witness selection       | unit    |
| Null handling — `+ none`, bounds never admitting null, `0` ≠ null                       | unit    |
| `admits(budget, card)` — thresholds, off-colour exclusion, null `ramProvided`           | unit    |
| Sort comparators — including nulls-last                                                 | unit    |
| `FilterStateSchema` round-trip — params → state → params, and malformed input degrading | unit    |
| Rules-text segmentation — all five markup systems, and the flavour split                | unit    |
| Ingest assertions — each one fails the build when violated                              | unit    |
| Grid interaction: filter → narrowed results, art swap, URL updated                      | browser |
| Detail route: printing deep-link, gallery                                               | browser |

**`Rebecca — Having a Moment` is the mandatory fixture** — null on `cost`, `power`, `ram` and
`rules_text`, with empty `classifications`. Every normalization and rendering path must survive it.
`V — StreetKid` is the variety fixture: 5 printings, 2 artists, 3 art treatments, and the only a/b card.

---

## 12. Performance budget

Not yet measured; these are the targets and the things to measure.

- Dataset: **estimated** low hundreds of KB raw, tens gzipped. Measure once the pipeline exists.
- Derivative byte sizes at 244w / 488w / 733w are **estimates** in notes §4 and were never measured.
- The first grid row must load **eagerly**; lazy-loading above the fold produces a blur flash.
- Blur-up is a first-visit-only effect given immutable caching.
- No memoization in the filter pipeline — revisit only with a measurement.
- Watch for the dataset shipping twice beyond the accepted ~70 KB in §7.

---

## Open questions

Things a reader will reasonably ask that this spec does not answer.

1. **The project's name.** `novastack` is the repo name used as a placeholder. A real name changes the
   wordmark and the landing page's mark.
2. **The Set facet's grouping.** §4.5 requires base-vs-derivative grouping but does not specify the
   presentation — grouped headers, a two-level control, or a retail/beta toggle.
3. **Whether the hero cards rotate** per build or stay a fixed curated seven.
4. **Whether `flavorText` is separately searchable.** The audit's "flavour isn't filter-worthy" verdict
   rested on the field being null, which turned out to be wrong.
5. **Empty, loading and error states** beyond the zero-result case, which is specified.
6. **Format rotation.** `[A]` is believed to be a rotation cycle, and the API exposes **no cycle data
   at all** — so rotation-aware legality cannot be derived from this source. `legality` was cut as a
   facet for being constant; it will not grow into this. If rotation matters, it must come from the
   curated set map.
7. **Mobile composition** for the landing fan and the collapsed filter panel — specified in intent,
   not in layout.

---

## Provenance

| document                                                 | holds                                                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT.md`                                             | the domain glossary — 28 terms, definitive                                                                                                                            |
| `docs/adr/0001-slug-is-the-canonical-card-id.md`         | why slug, and the rejected alternatives                                                                                                                               |
| `docs/adr/0002-discard-the-flattened-printing-fields.md` | why the copies are dropped                                                                                                                                            |
| `docs/research/facet-cardinality.md`                     | the measured audit behind every facet verdict                                                                                                                         |
| `docs/research/card-grid-layout.jpg`                     | the settled grid + pane layout                                                                                                                                        |
| `docs/research/landing-layout.jpg`                       | the settled landing page                                                                                                                                              |
| `docs/netdeck-api-notes.md`                              | the original API survey. **Superseded in two places**: it ships two image tiers (§3 here ships three) and reports concurrency 12 as safe (§2.1 here requires retries) |
