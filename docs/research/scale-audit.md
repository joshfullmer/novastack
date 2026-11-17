# Research: scaling the tournament data to hundreds of events over several years

Gathered **2026-11-17**, on the code as committed through `fcb7470`. Tags: **[measured]** run here,
**[inferred]** my reading of the code or the platform, **UNVERIFIED** not reached. Everything measured
comes from `src/lib/server/db/scale.spec.ts` and `test-corpus.ts`; to repeat it:

```
TOURNAMENT_SCALE=100,300,1000 TOURNAMENT_SCALE_OUT=/tmp/report.md \
  pnpm exec vitest run src/lib/server/db/scale.spec.ts
```

## Verdict

The verdict below is as first written, **before** rows 1 and 2 were built; "Status" has the numbers after.

- **Nothing falls over at a thousand events, and the schema is sound.** On a corpus of 1,000 events (about
  18,500 decks, 592,000 deck-card rows, 85,000 matches) the whole database is ~54 MB, one event page takes
  ~1 ms, and a paged deck list 15–35 ms. D1's size ceiling is not in sight. **[measured]**
- **The aggregate pages grow linearly with the corpus, and a time window doesn't help them.** The meta tier
  list takes 23 → 69 → 287 ms at 100 → 300 → 1,000 events, and "last 30 days" takes 226 ms, nearly the same,
  because SQLite walks the whole card index and filters afterwards. **[measured]**
- **The bigger problem is what the pages return, not how long they take.** At 1,000 events the card page for
  a staple card returns **4.9 MB**, the event list **1 MB**, the tier list **765 KB**, because each returns every
  row. That is Worker CPU and bandwidth on every view. **[measured]** (The Worker CPU consequence is **[inferred]**.)
- **One additive schema change fixes most of the query cost**: put `tournament_id` on each deck-card row and
  index `(board, tournament_id, card_slug)`. Tested on the 1,000-event corpus, a windowed card-stats query
  went from 388 ms to 3.3 ms and a windowed Legend query from 221 ms to 0.6 ms. **[measured]**
- **All-time aggregates still grow linearly after that** (card stats 241 ms), which is what precomputed
  summaries are for; reading one takes ~0.1 ms. swubase does the same. **[measured]**
- **The ingest side has its own ceilings that no query fixes**: finding event ids (by hand today), the
  write budget for a backfill, and a `--reparse` that rewrites every deck. **[inferred]**

## Status: what was built from this (2026-11-17)

Rows 1 and 2 of "Before launch" are built; row 3 is split, and its caching half is **not** built (see below).
Measured on the same 1,000-event corpus, before → after. **[measured]**

| query                          | before                                         | after                                            |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------------ |
| meta tier list, last 30 days   | 226 ms / 765 KB                                | **9 ms / 29 KB**                                 |
| meta tier list, all time       | 287 ms / 765 KB                                | 86 ms / 30 KB                                    |
| what's played, last 30 days    | 401 ms                                         | **4.4 ms** (flat across 100/300/1,000)           |
| what's played, all time        | 462 ms                                         | 295 ms (needs row 4)                             |
| what's played, one Legend line | 4.3 ms                                         | 3.9 ms (unchanged, see note)                     |
| card page, a staple card       | 106 ms / **4,935 KB**                          | 110 ms / **27 KB**                               |
| event list                     | 74.5 ms / **1,005 KB**                         | 39 ms / **24 KB**, 24 events a page              |
| decks by Legend line           | 26 ms / 334 KB, silently capped at 1,000 decks | 37 ms / 32 KB, 12 lines of 12 decks, counts true |

- **Row 1, built.** Migration `0016` rebuilds `tournament_deck_cards` with a `tournament_id` (NOT NULL,
  cascading) and the index `(board, tournament_id, card_slug)`; ingest and `--reparse` write it, and the
  window queries filter on it with `tournament_id IN (SELECT id FROM tournaments WHERE …)`. SQLite cannot add
  a NOT NULL foreign-keyed column in place, so the migration is a table rebuild; it was tested over existing
  rows (`migration-0016.spec.ts`) and applied to the local D1 (679 of 679 rows backfilled, foreign-key check
  clean). **Not applied to production**, where 0014 and 0015 are also still waiting.
- **A planner trap found on the way.** With the new index in place, the "one Legend line" query went from 4 ms
  to 255 ms: the planner preferred walking every card row by `board` to starting from the line's few decks.
  That branch keeps `board <> 'legend'`, which the index cannot serve, and says so in a comment.
- **Row 2, built.** Every list is bounded by a constant, and a page that cut something says so: tier list
  100 lines + "N others, M decks" (shares still count them), colour groups folded over all lines; card page 100
  best finishes of N and 25 lines; event list 24 a page (`?page=`); shelves 12 lines × 12 decks with true
  counts and "+N more". The 1,000-deck silent cap is gone. Filters on the event list (kind, year,
  organizer) are **not** built.
- **Row 3, half built.** The auth-free hook branch is built (`public-routes.ts`): a GET or HEAD of
  `/tournaments/**` gets `locals.db` and skips `createAuth` and the session lookup. Edge caching is **not**
  built, and the claim made in this audit's first version was wrong; see the correction under "Request path".

## What was measured, and how far to trust it

A deterministic synthetic corpus (`seedCorpus`, seeded) built in the real-SQLite test harness: ~30 players
an event drawn from a pool of 3,000 returning players, ~60% with a list, a few staple cards in most decks and
a long tail of rare ones, 40 Legends with a few popular and many niche. **What it can't tell you:**

- **D1's billing.** `rows_read` comes from D1. A plan line that says SCAN is where that number grows with the
  corpus, but I haven't seen D1's counter. An order of magnitude: a query that walks 592,000 card-index
  entries and fetches each row can read about a million rows a view. **UNVERIFIED** against D1's meter.
- **D1 latency, concurrency, cold starts, or Worker CPU time.** Timings are an in-memory SQLite on a laptop:
  good for _shape_ (linear or not), not for absolute numbers.
- **Real Legend diversity.** The corpus has 4,278 distinct Legend lines at 1,000 events, 2,221 with a single
  deck. The real long tail depends on how many Legends exist and how players pick them; a smaller tail makes
  the tier-list payload smaller but not the scan.
- The database size used 1-byte deck text; real text is ~700 bytes, so add ~13 MB at 1,000 events: ~67 MB.

## Measured: every page, at three sizes

Corpus rows: 100 events = 1,887 decks / 60,384 card rows; 300 = 5,467 / 174,944; 1,000 = 18,501 / 592,032.

| query                                 |       100 ev ms |       300 ev ms |         1000 ev ms | growth | returns at 1000 | scans (largest corpus)                                |
| ------------------------------------- | --------------: | --------------: | -----------------: | -----: | --------------: | ----------------------------------------------------- |
| event list (every event)              |             8.0 |            22.4 |               74.5 |   9.3× |         1005 KB | tournaments, standings, `best`, tournament_deck_cards |
| one event page                        |             1.6 |             0.8 |                0.9 |   0.6× |           23 KB | none                                                  |
| meta tier list, all time              |            23.2 |            69.4 |              287.3 |  12.4× |          765 KB | tournament_deck_cards (whole card index)              |
| meta matchup matrix, all time         |            11.9 |            33.7 |              116.3 |   9.7× |          760 KB | tournament_matches                                    |
| meta tier list, **last 30 days**      |            17.5 |            52.4 |              225.7 |  12.9× |           54 KB | tournament_deck_cards (whole card index)              |
| what's played, all decks, all time    |            34.8 |           108.8 |              461.8 |  13.3× |           16 KB | tournament_deck_cards, tournament_decks               |
| what's played, one Legend line        |             0.6 |             1.2 |                3.8 |   6.0× |           15 KB | none                                                  |
| what's played, all decks, **30 days** |            30.7 |            94.3 |              400.9 |  13.0× |           15 KB | tournament_deck_cards (whole card index)              |
| card page, staple card                |            11.2 |            28.4 |              106.1 |   9.4× |     **4935 KB** | standings                                             |
| card page, rare card                  |             3.1 |             7.9 |               25.6 |   8.1× |          535 KB | standings                                             |
| deck list, best finish, page 1        |             2.0 |             4.8 |               15.8 |   7.8× |            6 KB | standings                                             |
| deck list, most recent, page 1        |             2.5 |             6.3 |               20.6 |   8.4× |            7 KB | standings                                             |
| deck list, deep page (100)            |             2.9 |             8.1 |               22.6 |   7.7× |            6 KB | standings                                             |
| deck list, by Legend / by card / name | 3.4 / 3.6 / 2.0 | 8.7 / 9.3 / 4.8 | 33.2 / 35.0 / 14.8 | ~8–10× |            6 KB | standings                                             |
| decks by Legend line (shelves)        |             4.6 |             8.7 |               26.1 |   5.7× |          334 KB | standings                                             |

**How to read it.** Growth near 10× for 10× the data is linear: not alarming at 300 ms, but not
bounded either. The two rows in bold type are the surprising ones: a window should have made those queries
cheap and it didn't.

## Why the windows don't help, and a fix that was tested

`tournament_deck_cards` is the big table (≈32 rows a deck) and it carries only `deck_guid`. A period is a
date range on `tournaments`, two joins away. With no statistics and no column to filter on, the planner walks
the whole `card_slug` index and applies the date filter last. Candidate fixes, each tried on the 1,000-event
corpus in raw SQL (no migration):

| change                                                              |                before |             after |
| ------------------------------------------------------------------- | --------------------: | ----------------: |
| Legends from a separate 3-rows-a-deck table, all time               |              250.5 ms |           24.9 ms |
| Legends from a separate 3-rows-a-deck table, 30 days                |              227.2 ms |            2.5 ms |
| card stats with `tournament_id` on the row, 30 days                 |              404.5 ms |            3.4 ms |
| **Legends via index `(board, tournament_id, card_slug)`, all time** |              247.5 ms |       **39.5 ms** |
| **Legends via the same index, 30 days**                             |              221.3 ms |        **0.6 ms** |
| **card stats via the same index, 30 days**                          |              387.8 ms |        **3.3 ms** |
| card stats via the same index, all time                             |              414.7 ms |          240.9 ms |
| card stats from a precomputed summary, all time                     |              414.7 ms |       **~0.0 ms** |
| card-page entries, staple card, every deck → first 50               | 30.3 ms (18,489 rows) | 18.6 ms (50 rows) |
| event list, every event → one page of 30                            |    0.4 ms (1000 rows) |  0.0 ms (30 rows) |

So: **a single additive column plus one index turns every windowed query from linear to a range read.** What
it can't fix is "all time", which is inherently a scan of everything: that wants a precomputed summary
refreshed when an event is ingested. The last two rows are about _rows returned_, where the time hardly
changes but the page does (see below).

## Other things that change at scale

**Measured above, not just queries:**

- **Unbounded results.** The tier list, event list, card page and shelves each return every row. At
  1,000 events that is 765 KB, 1 MB, 4.9 MB and 334 KB. **[measured]** Server-rendering and serialising that
  is Worker CPU. An earlier look at Cloudflare's limits found a 10 ms CPU cap on the free Workers plan and far
  larger caps on paid (**UNVERIFIED** here; check the current limits). **[inferred]** Whether it is
  acceptable depends on the plan; bounded output is right either way.
- **A silent truncation.** The Legend-line shelves read at most 1,000 decks (`SHELF_DECK_CAP`), most recent
  first. At 1,000 events that is the latest 5% of decks, presented as "all time". **[measured]** Cheap to
  hide, hard to notice.
- **The Legend-line long tail.** 4,278 lines, 52% with one deck. A tier list that shows them all is mostly
  noise; the win-rate mask (`n<5`) hides the number but not the row. **[measured]**

**Request path (not measured; from reading the code):**

- Every `/tournaments*` request ran `createAuth(...)` and `auth.api.getSession` in `hooks.server.ts`, though
  these pages never use a session. **[inferred]** The hook branch now skips both for reads.
- **Correction: `Cache-Control: public, s-maxage=…` does not by itself cache a page the Worker generated.**
  An earlier version of this note said it would, and so did the spec (§6). Cloudflare's documentation says
  the Cache API is separate from the CDN cache that serves a response "without executing your Worker"; to
  store a Worker's response the Worker has to call `cache.put()` itself
  (<https://developers.cloudflare.com/workers/runtime-apis/cache/>). **[documented]** What the same page
  says about that route:
  - it caches **per data center**, with no replication, and `cache.delete` purges only the data center the
    Worker ran in, so an ingest **cannot purge globally**; only a short TTL (or a version in the cache key)
    bounds how stale a page gets;
  - it works on **custom domains**, and the page does not say it works on `workers.dev`; whether production
    is on a custom domain is not something this audit checked;
  - a response with `Set-Cookie` is never cached, `stale-while-revalidate` is not supported, and a
    `Cache-Control` that forbids caching returns a 413;
  - it says nothing about billing for cache calls (**UNVERIFIED**; check the pricing page).

  So a cache here is real work (a `handle` step that matches, puts and strips cookies, with `waitUntil`) and
  a staleness decision (minutes, since an ingest can't purge), not a header. It is deferred; with rows 1
  and 2 the uncached pages cost 4–110 ms at 1,000 events, and the payloads are tens of KB.

**Ingest and operations (not measured):**

- **Discovery is the real ceiling.** Ids are supplied by hand. Hundreds of events means a source of ids
  (a known player's public history, organizer feeds) and a queue; today a person is the queue.
- **Throughput.** The five real events averaged ~23 requests and ~213 SQL statements each. At the 500 ms gap
  a crawl is on the order of 20–60 s an event, so a 600-event backfill is hours, not days. Writes are the
  tighter limit: 600 events is ~130,000 rows inserted (and D1 may count index writes too, which would be more: **UNVERIFIED**), which can
  exceed a free tier's daily write allowance and wants spreading over days. **UNVERIFIED** against D1's meter.
- **`--reparse` rewrites every deck's card rows** (592,000 at 1,000 events) as one SQL file. Fine at five
  events; at scale it needs chunking by event, or only rewriting decks whose reading changed.
- **No raw archive.** Only parsed rows and each deck's text are kept. A new column that needs data we didn't
  keep (say per-game results) means re-crawling Melee, which we are not formally permitted to do at volume
  (`docs/spec/tournaments.md` §5). Storing each event's raw responses (the 14-player event's JSON and one deck page were ~100 KB; each
  deck page is ~20 KB, mostly page chrome, so keep the JSON and the decklist text) in R2 makes rebuilds free and protects against Melee changing or removing data.
- **Event kind can't be filtered in SQL.** It is derived from the name in TypeScript. "The Showdown meta"
  across hundreds of events needs a column. That reverses an earlier decision for a good reason.
- **Removing a player.** `players` has no cascade on purpose, so a removal request means deleting every row
  that names them; a hidden/anonymised flag is the safer shape.

## Recommendations, in order

**Before launch** (additive, small, and each is the cheapest moment to make the change):

| #   | change                                                                                                                                                                                                                                                               | evidence                                              | effort                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Add `tournament_id` to `tournament_deck_cards`, backfilled, written by ingest, with an index `(board, tournament_id, card_slug)`                                                                                                                                     | windows 388 → 3.3 ms, Legends 221 → 0.6 ms            | small: one migration, one ingest line, and the queries filter by it |
| 2   | **Bound every page's output**: top-N lines with a minimum deck count and "show all"; the event list in pages of 30 with filters (kind, year, organizer); the card page's decks paged or capped at the best finishes; shelves paged, and the silent 1,000 cap removed | payloads 765 KB / 1 MB / 4.9 MB / 334 KB → tens of KB | medium: pure shaping plus URL params                                |
| 3   | **Cache the public pages**: a `handle` step using the Cache API (see the correction under "Request path"), short TTL; and the auth-free hook branch (**built**)                                                                                                      | read cost becomes ~constant                           | small, but a staleness decision; deferred                           |

**When the corpus passes a few hundred events, or the first measured `rows_read` complaint:**

| #   | change                                                                                                                                                                                                  | evidence                                 | effort                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| 4   | **Precomputed summaries** per period (card stats, line stats), refreshed by `pnpm melee` after each ingest; keep the SQL as the oracle that the summary is tested against                               | all-time card stats 241–462 ms → ~0.1 ms | medium: tables, a refresh step, and a test that equal the live query |
| 5   | **Ingest at volume**: id discovery and a queue, a CI workflow with a Cloudflare token and failure alerts, chunked remote writes, a chunked or incremental `--reparse`, and a raw-response archive in R2 | the numbers in "Ingest and operations"   | large; and it is the real limit                                      |
| 6   | A stored `kind` (and `format`) column, recomputed by a cheap `UPDATE` when the name rules change                                                                                                        | kind can't be filtered in SQL            | small                                                                |
| 7   | Player removal as a flag (hidden or anonymised), not a delete                                                                                                                                           | `players` is shared by every event       | small                                                                |

**Guardrails to add now, because they cost almost nothing:** keep the scale audit and corpus in the repo
(done); add an always-on test that asserts the windowed queries never scan `tournament_deck_cards` (a plan
check on a small DB, so it needs no big corpus); and log D1's `meta.rows_read` for these queries in
production, so the first real number replaces my estimate.

**Leave alone.** Sharding, a second database or a move to Postgres: the database is ~67 MB at a thousand
events against a ceiling in the gigabytes, and the paged and windowed queries are 1–35 ms. Live polling and
websockets (swubase's live weekends): none of the pages needs them. Precomputing the matchup matrix: 116 ms
at 1,000 events, and a window or a cache covers it.

## What would change this

- **Real data much denser than the corpus**, say hundreds of decks per event (a Regional), changes the
  per-event costs, not the shape.
- **A measured `rows_read`** that disagrees with the scan reading above. Everything in "Before launch" is
  still right, but #4 gets urgent or relaxed accordingly.
- **Melee limiting or blocking us**, which makes #5 (raw archive, discovery) the first thing to do, not the last.

## Provenance

| source                                                            | used for                            |
| ----------------------------------------------------------------- | ----------------------------------- |
| `src/lib/server/db/scale.spec.ts`, `test-corpus.ts`               | every number marked **[measured]**  |
| `src/lib/server/db/tournament-{stats,decks}.ts`, `tournaments.ts` | the queries measured                |
| `src/hooks.server.ts`, `signed-in-hint.ts`                        | the request path                    |
| `docs/research/melee-ingest.md`, `docs/spec/tournaments.md`       | ingest rates, Melee constraints     |
| Cloudflare D1 limits page (read earlier)                          | the 100-parameter and size ceilings |
