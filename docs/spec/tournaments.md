# Spec — Tournaments (stage 4): data model and ingest

Tournament results and the decks that played them, ingested from Melee (melee.gg), the Cyberpunk TCG's
tournament software, into D1. This is the "tournament/meta analytics" project that
`docs/spec/deckbuilder.md` declared out of scope.

**Scope.** What is stored, the job that fills it, and what the meta statistics are computed from it
(§6). Three outputs are wanted: **decklists**, **tournament results**, and **meta stats**. The pages
that show them (`/tournaments`, a Tournament's page, meta breakdowns) are a separate spec.

**Rationale lives elsewhere.** Every fact about Melee below — endpoints, shapes, the WAF, what works
anonymously — was measured and is in `docs/research/melee-ingest.md`. Terms (**Tournament**,
**Standing**, **Tournament Deck**) are in `CONTEXT.md`.

---

## 1. Constraints

1. **A deliberate, scoped widening of the backend.** `deckbuilder.md` §1.5 limited the backend to
   accounts, decks and likes and said no feature may "casually grow" it. This is not casual: filterable
   meta statistics need queries, and §2 explains why files can't give them. It is bounded the same way
   the deckbuilder's was:
   - **the same database**, binding `DB`; no second database, no new binding;
   - **public and read-only to the site**: the Worker only `SELECT`s; only the ingest job writes;
   - **additive**: new tables only, no change to an existing one (§3, "Migration").
2. **Never trust the source's shape.** Every Melee response is `v.parse`d at the boundary
   (`src/lib/tournaments/sources.ts`), like `prices/sources.ts`. Melee has no documented schema and
   a prior scraper broke when it renamed an endpoint.
3. **Ingest the way swubase.com does.** It is in production against the same Melee endpoints for Star
   Wars: Unlimited, so the method is copied, not redesigned (decision 2026-11-16):
   - plain `fetch`, sequential, no headless browser, no login, no Melee API credentials;
   - a browser User-Agent (their string: Chrome 139 on Windows) plus `X-Requested-With:
XMLHttpRequest` — no `sec-ch-ua*` or `sec-fetch-*` headers, as in their newer module;
   - an **optional** `MELEE_COOKIE` env var, sent as `Cookie` only when set. Unset by default: their
     newer module and our own probe both work without one. It is the escape hatch for the login page
     their docs warn about (§4.2), and must come from a **logged-out** browser, never a signed-in
     session;
   - a small gap between requests, **500 ms** by default (their 300–500 ms), via `MELEE_DELAY_MS`;
   - **manually triggered, one tournament id at a time**: a person supplies the id. Nothing enumerates
     Melee for events we lack.

   Two deviations are deliberate. Our probe showed an honest `Mozilla/5.0 (compatible; …)` UA also
   passes the WAF (research §Etiquette), so the constant is one line to change. And the volume is a
   small fraction of theirs: finished events only, no live polling, no scan. `robots.txt` says
   `Crawl-Delay: 5` and disallows `/Decklist/View/`; both are knowingly not honoured, as by swubase (§5).

4. **Failure is the interface.** As `pnpm prices`: any violated invariant or unreachable source exits
   `2` and writes nothing for that Tournament.
5. **No type coercion** (`as`, `!`), as everywhere.

---

## 2. Storage: D1, and where the design comes from

**Why D1, not committed JSON.** An earlier draft of this spec stored one JSON file per Tournament.
That is right for the _event_ pages (immutable, read whole, prerenderable) and wrong for the _meta
statistics_, which are queries: by window, by format, by event size, by Legend line, by Card. Files
give fixed views only; every new filter would be another build-time derivation, every ingest a commit
and a full redeploy, and the corpus a build-time pass over everything. swubase, which has exactly
these pages, keeps tournaments in Postgres and precomputes statistics into tables. We do the SQLite
equivalent in the database we already have.

**What it costs.** Reads of these pages invoke the Worker (billable, unlike static assets) and every
aggregate reads rows (D1 bills by rows read). Both are small at hobby traffic and both are managed in
§6; the deckbuilder's own pages already pay the first.

### 2.1 Lineage: borrowed design, not borrowed code

The shape below follows swubase's schema (`the-medo/swu-collection`, `server/db/schema/`):

| their table                                                                       | idea we take                                               | ours                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `tournament`, `tournament_deck`, `tournament_match`                               | a Tournament, its per-player results, its match rows       | `tournaments`, `standings`, `tournament_matches` |
| `deck` + `deck_card` (board column)                                               | a deck is rows of (card, board, quantity), indexed by card | `tournament_decks` + `tournament_deck_cards`     |
| `meta` (set, name, date range)                                                    | a named period that statistics are cut by                  | `metas`                                          |
| `card_stat_meta*`, `tournament_group_*` (count_md/sb, deck_count, match_win/lose) | precomputed counters per meta and per leader               | held back: §6 "Escalation"                       |
| `tournament_matchup_filter`                                                       | saved matchup filters                                      | held back: needs accounts (§7)                   |

**License.** swubase is **AGPL-3.0**; Novastack is a public repository with no license. Copying their
Drizzle definitions or import code would make ours a derivative work and put Novastack under AGPL's
network-source obligation. So: the _design_ above (tables, relationships, which counters matter) is
borrowed, and every definition and function is written fresh for SQLite and for our terms. If verbatim
reuse is ever wanted, it needs the author's written permission (they are reachable; the user has spoken
with them), recorded here. This is a design constraint, not legal advice.

Where we deliberately differ: swubase keys people by Melee **username** and reuses its general `deck`
table (so a tournament deck is a user deck owned by a system account). We key people by Melee
**`Player.ID`** (usernames can be `__placeholder__`; their import throws on duplicate names) and keep
Tournament Decks apart from Decks, which carry owners, versions and visibility.

---

## 3. Schema

Drizzle, in `src/lib/server/db/schema.ts` beside the other tables (the repo keeps them in one file);
**built, as migration `drizzle/0014_*.sql`** (8 `CREATE TABLE`, 9 `CREATE INDEX`, nothing else; applied
cleanly after 0000–0013 on a fresh local database). Foreign keys cascade from `tournaments`, so
**re-ingesting a Tournament is `DELETE FROM tournaments WHERE id = ?` plus inserts** and nothing is
orphaned. The sketch below is the intent; `schema.ts` is the source of truth for column spellings.
`standings.deckGuid` points at `tournament_decks.guid`, so decks are inserted before standings, and
`players` before both.

```ts
tournaments        // one per ingested Melee event
  id               integer PK        // Melee's tournament id — ours too; not autoincrement
  name             text
  startsAt         integer (ms)      // Melee's StartDate
  organizerId      integer
  organizerName    text
  format           text              // "Constructed" — Melee's word, not interpreted
  formatId         text              // Melee's format GUID (the one in the Decklists filter URL)
  playerCount      integer           // ParticipatorCount
  venue            text null         // the page header's "Event Venue" (migration 0015)
  tournamentType   text null         // header's "Tournament Type": how it's played ("Tabletop"), NOT a category
  entryFee         text null         // as shown, currency and caveat included; not parsed to a number
  registration     text null         // "Open Registration" / "Invite Only"
  capacity         integer null      // the cap in "14 of 32 Enrolled Players"
  ingestedAt       integer (ms)
  idx: startsAt

rounds             // PK (tournamentId, number)
  tournamentId, number, meleeRoundId, name     // number = button order, incl. top cut (§4.1)

players            // shared across Tournaments
  id               integer PK        // Melee Player.ID — the only stable identity
  displayName      text              // free text, as shown on Melee; latest ingest wins
  username         text null         // null when Melee reports "__placeholder__"

standings          // PK (tournamentId, playerId): the last round's standings = final results
  tournamentId, playerId, rank, points,
  matchWins, matchLosses, matchDraws, gameWins, gameLosses, gameDraws,
  deckGuid         text null         // null: no list registered
  idx: (tournamentId, rank), deckGuid

tournament_decks   // PK guid
  guid             text              // Melee's decklist guid
  tournamentId, playerId
  name             text              // the player's own label — NOT an archetype
  text             text              // the deck page's decklist text, verbatim — the source of truth
  legendLine       text null         // the three Legend slugs, sorted, joined by "+"; derived
  unresolved       integer           // count of lines that named no single Card; derived
  idx: tournamentId, legendLine

tournament_deck_cards   // PK (deckGuid, cardSlug, board): a derived index of `text`
  deckGuid, cardSlug, board ('main' | 'legend' | 'side'), quantity
  idx: cardSlug

tournament_matches
  id               integer PK autoincrement
  tournamentId, round (number), tableNumber null,
  playerA, playerB null (bye), gamesA, gamesB, draws,
  kind             ('played' | 'draw' | 'bye' | 'forfeit')
  idx: (tournamentId, round), playerA, playerB

metas              // named periods; hand-seeded (§7)
  id, name, startsOn, endsOn null (open-ended)
```

A Tournament belongs to a meta when its `startsAt` falls in `[startsOn, endsOn)`: **derived, never
assigned**, so adding or moving a meta needs no edit to any Tournament.

### 3.1 Decisions that came from the data

- **Key people by `playerId`, never username.** Unclaimed players carry `Username: "__placeholder__"`.
  `displayName` is free text and not unique.
- **`tournament_decks.name` is not the archetype.** In the one event measured it is colour letters
  (`"G R R"`). Grouping is by Legends (§6).
- **Records come from the standings row's numeric fields**, not from `MatchRecord` strings and not from
  `GetTournamentViewData` (its game record was ordered differently for the same player: `8-1-0` vs
  `8-0-1`). The ingest asserts `wins + losses + draws === GameCount`.
- **Match outcomes come from `Competitors[].GameWins`**, with `ResultString` used only to classify
  `kind` (`bye`, `Draw`, `forfeited`). Never split the prose on `" won "` to find a winner: a player
  may be named `"Dude won the Potato"`.
- **A player with `0-0-0` that Melee ranks high** is dropped from `standings` and later ranks are not
  renumbered; the ingest keeps Melee's `rank` as given and reports the skipped rows (swubase's own
  import renumbers; revisit if a real event shows it matters).
- **Several decklists per player** can exist; keep the one whose `FormatId` equals the Tournament's
  `formatId`, and fail the run if more than one matches.

- **Event kind is derived from the name, never stored.** Melee has no event-type field (research
  `melee-ingest.md`): "Showdown" exists only in what an organizer typed. `eventKind(name)` in
  `src/lib/tournaments/kind.ts` is an ordered list of name rules (first match wins), applied when a page is
  built. The categories are **Regional, Showdown, Brawl, Prerelease and Other**, named by the project
  owner; `Other` is what no rule matches, never a guess. Rules are tried most-specific first (Regional,
  Prerelease, Brawl, Showdown), so a name that says two things is the bigger event. A rule is a rule, not
  data, so a new one covers every event already ingested with no re-ingest. **Only Showdown has been
  seen in real data** (all five events); the other patterns are the obvious spellings, to be checked against
  the first real Regional, Brawl or Prerelease. The header fields above are stored because they are Melee's
  data, and are all nullable because a header we can't read must not stop an ingest.

### 3.2 `text` is the source; the card rows are an index

A Tournament Deck is stored as the text Melee showed (`MainDeck` / `Legends` / `Sideboard`,
`qty Name | Subname`), HTML-entity-decoded (`&#39;` → `'`). `tournament_deck_cards`, `legendLine` and
`unresolved` are **derived from it** so SQL can answer "which decks ran this Card" and group by Legend.

Why the text stays: the reading of text into Cards is ours, and it changes — a new Set adds Cards an
old list can now resolve; the Legend separator "has already changed twice" (`#lib/decks/import.ts`).
A derived index can be rebuilt when that happens; a stored-only parsed form would freeze a stale
reading, and recovering would mean re-crawling Melee.

The reader is the one that exists: **`parseDeckImport` in `#lib/decks/import.ts`** accepts Melee's
headers and `|` separator, resolves by name, never guesses, and returns `unresolved` lines. The
ingest runs it per deck and writes the index; an unresolved line is **counted, never dropped or fuzzily
matched** and does not block the Tournament (a Card we haven't ingested yet must not). A deck that
resolves to zero or to other than three Legends, or to a main deck outside 40–50 cards, is reported as
suspicious. **`pnpm melee --reparse`** rebuilds every derived column and index row from stored `text`
with no network, for when `cards.json` moves.

### 3.3 Migration

New tables only, via `drizzle-kit generate` into `drizzle/` like migrations 0000–0013: `CREATE TABLE`
and `CREATE INDEX`, no `ALTER`, nothing that touches `decks`, `deck_versions` or auth. The production
database has real users, so the migration is checked against a copy of the production schema before it
is applied.

---

## 4. The ingest job

`scripts/melee.ts`, run as `pnpm melee`, with the conventions of `scripts/prices.ts`:

```
pnpm melee 485070 [id …]    ingest the given Melee tournament ids into the LOCAL D1; each is rewritten whole
pnpm melee --remote 485070  the same, against the PRODUCTION database, after a y/N question
                            (--yes skips it; with no terminal and no --yes the answer is no)
pnpm melee 485070 --persist-to DIR   a throwaway local database, to try a run out
pnpm melee --check 485070   fetch and diff exactly as a real run; write nothing
                            exit 0 current · 1 would change · 2 invariant violated / unreachable
pnpm melee --reparse        rebuild the derived deck columns and card index from stored text (no network)
```

**Local by default; `--remote` is explicit.** Production is only ever written on purpose, after our
own confirmation (`scripts/lib/d1.ts`), which names the Tournament and the statement count.
**Manually triggered, one id at a time**, the way swubase does it: a person supplies the id. Running
an id again rewrites it (also how a repair or a decks-arrived-late fill-in works). There is no scan, no
schedule and no CI workflow in v1: writing production D1 from CI would need a Cloudflare API token, and
a person at a terminal with `wrangler` already logged in needs none.

**Built and exercised live (2026-11-16).** `scripts/melee.ts` + `src/lib/tournaments/{client,ingest,
sql,args}.ts`. Against tournament 485070 into a scratch local D1: 21 requests (16 s) wrote 357
statements (14 standings, 28 matches, 13 decks, 282 card rows); a second run with `--check` said
"current" (exit 0); after tampering with one standing, `--check` named `standings: 14 stored, 14
built, 1 differ` (exit 1); rewriting repaired it with row counts unchanged (idempotent);
`--reparse` rebuilt all derived deck data from stored text with no network; `--remote` with no
terminal declined to write (exit 2). All 13 decks read with **0 unresolved lines** and three Legends.
One deck is 21 main-deck cards: Melee's own list is that short (a player registered an incomplete
deck), and `reviewDecks` reports it. Not exercised: `--remote` writes, byes/forfeits/top cuts, a
non-empty `GetPlayerDetails`, paging above 500 rows.

### 4.1 Flow, per Tournament

```
GET  /Tournament/GetTournamentDetails?id=      → status, name, organizer, start, player count, format
       └─ not "Ended"? refuse: "still {status}; try again when it's over" (exit 2).
GET  /Tournament/View/{id}                      → round ids/names/order (HTML round buttons) and the header
                                                  (venue, type, fee, registration, capacity: each may be null)
POST /Standing/GetRoundStandings  roundId=last  → final Standings (+ decklist guids); page by 500
GET  /Player/GetPlayerDetails?id=  × players    → ONLY for Standings whose Decklists is empty
POST /Match/GetRoundMatches/{roundId}  × rounds → every match; page by 500
GET  /Decklist/View/{guid}  × decks             → pre#decklist-text  (see §5)
       └─ no readable list at all? refuse: "no decklists; not ingested" (exit 2).
  → v.parse each response → build → parseDeckImport per deck → assert (§4.2)
  → write: DELETE the Tournament (cascades), then INSERT everything, then upsert `players`
```

Learned from swubase's production experience (`.ai/planning/feature-live-tournaments/live-flow.md`),
not from our one measured event:

- **An event with no decklists is not ingested** (decision 2026-11-16). Decks are what every page is
  built around, so a results-only Tournament isn't kept; there is no `--no-decks` and no results-only
  path. Lists can appear after the status flips to Ended, so the refusal is "not yet": whoever ran the
  job runs it again later, and the rewrite fills the decks in. "No decklists" means no player has a
  readable one; a blank list counts as none. An event where only some players published decks (4 of 26 in 478979) is ingested, and its other players simply have no deck.
- **Final standings can show no decklist for a player who has one.** swubase falls back to
  `Player/GetPlayerDetails?id=` (`decklists[]`) and so do we, but only for those rows. In the measured
  event that was 1 of 14 players.
- **No format gate.** swubase only expects lists for constructed formats; we don't ask. Any event
  that has lists is ingested, whatever Melee calls its format, and `format` is recorded so pages can
  filter (§7).
- **Top cut.** Rounds named `Quarterfinals`, `Semifinals`, `Finals` follow the numbered Swiss rounds and
  are **numbered by the order of the round buttons**, not by their names. Round ids and round numbers
  are different things; matches are fetched by id, stored by number.

Request count is `2 + 1 + rounds + decks (+ empty-decklist players, + pages above 500 rows)`. At the
default 500 ms, a 14-player 4-round event is ~10 s and a 200-player, 9-round one ~2 minutes of gap
time. Everything is sequential, so the gap is global.

### 4.2 Invariants (exit 2 and write nothing for that Tournament when violated)

- Every response parses its valibot schema; DataTables `recordsTotal` equals rows collected.
- The page returned for a decklist contains exactly one decklist-text element.
- **No response is a Melee sign-in page.** Checked on every HTML and JSON response (a redirect to
  `/Account/SignIn`, or the page's title). swubase's docs say a stale cookie "can produce a login page
  instead of tournament markup", and a login page that parsed as an empty Tournament is the quiet way
  this goes wrong. It fails the run loudly, naming `MELEE_COOKIE` as the thing to supply.
- `standings.length` is `playerCount` (or smaller only by the reported `0-0-0` skips).
- Every `Standing.deckGuid` is in `tournament_decks`; every match `playerA/B` is a `Standing.playerId`.
- Per Standing, `wins + losses + draws === GameCount`; match counts agree with the standings row.
- Ids are unique; the rounds are contiguous.

With several ids, an invariant failure skips only that Tournament and the others are still written, but
the exit is `2`, so one bad event never blocks the rest and is never silent.

### 4.3 Network

`scripts/lib/http.ts` already gives retry, backoff and the HTML-instead-of-JSON content-type check; the
job extends it with a **minimum gap between requests** (`MELEE_DELAY_MS`, default 500, shared across the
process), `POST` with a form body, an optional `Cookie` (`MELEE_COOKIE`), and a per-run request budget
(`--max-requests`, default 600) as a backstop against a loop. Headers, in one place
(`scripts/lib/melee.ts`):

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36
X-Requested-With: XMLHttpRequest
```

Browser strings are facts, not code. Not the `novastack/1.0 (+…)` the other scripts use: Melee's WAF
403s a UA that doesn't start `Mozilla/5.0`. A Chrome version string goes stale; what matters is that it
is a browser's, not that it is current. HTML (round buttons, decklist text) needs a parser; none is
installed. Add one as a devDependency (script-side only) rather than regexing markup, and decode
entities.

### 4.4 Writing to D1

The job builds the whole Tournament in memory first, then applies one change set: delete, then insert.
Values are bound or escaped by one helper with a test that round-trips quotes (`Don't Call Me Simon`),
since deck text is free text. Because a Tournament's write is **idempotent by id** (delete then insert),
a failed or interrupted write is repaired by running the same id again; correctness never depends on
atomicity.

**Spiked 2026-11-16, locally** (`wrangler d1 execute --local`, a throwaway directory): a file whose
third statement fails leaves **nothing** applied (atomic); `'Don''t'` and a newline inside a literal
round-trip exactly; foreign keys are enforced and `ON DELETE CASCADE` works. **Not tested:**
`--remote`, because the test writes to production. Cloudflare's docs are silent on atomicity of
`--file`, say not to put `BEGIN`/`COMMIT` in the file, and give `PRAGMA defer_foreign_keys = true` for
ordering problems (not needed here: inserts follow dependency order). Statement limit: 100 KB, and 100
bound parameters per query, so deck text (about 1 KB) is far under.

---

## 5. Where this departs from Melee's published rules

Stated plainly, because the method in §1.3 is a decision, not a default:

- `robots.txt` disallows `/Decklist/View/`, which is the only place a card list is shown, and sets
  `Crawl-Delay: 5`. The job fetches the first and runs faster than the second.
- The User-Agent is a browser's, not ours. The WAF is the only thing it satisfies.
- Melee's Terms of Use reportedly forbid automated access (secondary; not read), and its official API is
  approval-only (research §Verdict).

swubase does the same with, per its author, Melee's knowledge. **Novastack has no permission of its
own.** That is the accepted risk of this method: Melee can block the UA or the operator's IP at any
time, and the response is that the job fails with exit `2` and the data already in D1 stays as it was.

`docs/research/melee-permission-request.md` is a draft email asking Melee for leave and an allowlist.
**It describes an identifying User-Agent and a daily job, which contradict §1.3.** Don't send it as
written: either revise it to match what the job does, or send it and switch the job to the honest UA.

---

## 6. Meta stats

Computed with SQL over the tables in §3, from `tournament_decks` + `tournament_deck_cards` +
`standings` + `tournament_matches`, never stored (until "Escalation"). Every statistic takes a **window**
(a `metas` row, or a date range) and a **format**, and optionally a **minimum event size**.

**Grouping.** A deck is grouped by its Legends, from `board = 'legend'`:

| group            | key                                                                          |
| ---------------- | ---------------------------------------------------------------------------- |
| a Legend         | one Legend slug; a deck counts once per Legend, so shares sum to 3×          |
| a Legend line    | `tournament_decks.legendLine` (the sorted trio), stored so grouping is cheap |
| a RAM colour set | the colours the three Legends provide, from `cards.json` at read time        |

What a Cyberpunk TCG "archetype" is beyond these is open (§7).

**Statistics**

- **Field share**: decks per group as a fraction of decks with a readable `Legends` section.
- **Performance**: per group, match win rate `wins / (wins + losses + draws)` over `standings`, byes
  excluded, and the share finishing in the top 8 by `rank`. Always with the sample size (decks,
  matches); a group under 5 decks is shown as a count only.
- **Card inclusion**: per Card, the share of decks containing it, mean copies when included, main versus
  side; optionally within one Legend or Legend line.
- **Matchups**: from `tournament_matches`, each side's group via `playerId → standings.deckGuid →
tournament_decks.legendLine`. A matchup is a group against a group: games won, excluding mirrors, byes
  and forfeits, a draw counted as half. Matches whose player has no deck are excluded **and counted**.
  Elimination rounds count like Swiss rounds.

**Cost control.** D1 returns `meta.rows_read` with every query; each aggregate is written with the index
it needs (§3) and its `rows_read` is measured on a realistic corpus before the page that uses it ships.
Pages send `Cache-Control: public, s-maxage=…` so an aggregate is computed once per window, not once per
view. These are the two things that keep filterable stats affordable.

**Escalation.** If a measured aggregate is still too slow or too row-hungry, precompute it into counter
tables after each ingest, as swubase does (per meta and per Legend: `deck_count`, main/side counts,
`match_win`, `match_lose`). That is a later, additive migration, not a v1 table.

**Built: the event page (2026-11-16).** `/tournaments/[id]` with three views as sub-routes, so each is
linkable: `/tournaments/[id]` (standings, each row opening to its deck), `/podium`, and `/rounds`
(`?round=N`). One layout load (`getEventView` in `src/lib/server/db/tournaments.ts`, six indexed
selects) feeds all three; `buildEventView` (`src/lib/tournaments/event-view.ts`) shapes it and is tested
against the ingest's own fixtures. Dynamic, not prerendered; `/tournaments` is in the hooks'
`DYNAMIC_PREFIXES`. A non-integer or unknown id is a 404 before or after one lookup. Not yet done: a
shared-cache header (a response that may carry a session cookie can't be `public` without care), a nav
link (nothing to link to until the list page exists), and production (migration `0014` isn't applied).

**Built: the list page (2026-11-16).** `/tournaments` with two views of the same events, `?view=table`
(a dense ledger) and `?view=cards` (art-forward). `getEventList` reads **aggregates only** (counts per
event and one row per Legend), so its cost grows with events rather than decks. Each event carries a
"showcase": the best-placed player who registered a deck, so a card isn't blank when the champion left
their list empty (2 of the 5 events ingested so far); the page says which rank's deck it shows. Also
`noindex`, and unlinked from the nav until launch.

---

## 7. Open questions

### Settled

1. **Player names.** `players.displayName` is stored and shown as Melee shows it. It is not always a
   username: in the event measured one player's is a full name (a first-and-last name, with a placeholder
   `Username`), as the player entered it. It is public on melee.gg, so no scrubbing, and no removal
   process until someone asks. A removal then means a `DELETE` on `players` and the rows that name them.
2. **Discovery and scheduling.** None: a person gives the job a tournament id, as swubase does, and
   there is no watchlist, scan, cron or CI workflow (§4). swubase's only automatic ingestion is for
   admin-curated weekend memberships, which we don't have.
3. **Large events.** None of that size exist yet in the game. Paging above 500 rows and the runtime of
   a 200-player event are untested and unneeded now. The invariant in §4.2 (`recordsTotal` equals rows
   collected) makes a surprise fail loudly rather than truncate.
4. **Storage.** D1 (§2), over committed JSON, because the statistics are filtered queries.
5. **Events without decklists.** Not ingested (§4.1). No results-only Tournaments and no `--no-decks`;
   the `has_decks` column that recorded the distinction is gone from the schema and migration `0014`.

### Open

1. **What is an archetype?** §6 groups by Legend, Legend line, and colour set because those are
   readable straight off a deck. Whether players name decks some finer way (by a key non-Legend Card,
   say) is a game-knowledge question, not a data one.
2. **Which metas?** The `metas` table needs rows: a name and a start date per period ("since Set X").
   Hand-seeded; not yet decided. Until then, all-time and trailing windows work with no meta.
3. **Finding ids.** Where does a new Cyberpunk tournament id come from? From the person running the job,
   who has it from the Decklists page, Discord, or an organizer. If that gets tedious, swubase reads a
   player's public history from `POST /Profile/GetResults/{username}` (tournament id, game, rank,
   record, decklist), which could list a known player's events. Not tested by us.
4. **Elimination rounds** and **format.** The one event measured was 4-round Swiss and `Constructed`.
   §4.1 specifies the top-cut numbering and the format gate from swubase's experience; neither has been
   seen on a Cyberpunk event.
5. **Is the login page real?** swubase's docs warn of it, and §4.2 catches it, but only one event (an
   open, public one) has been probed. The first run on an event from a different organizer is the test.
6. **The D1 write path, remotely.** Locally a failing file rolls back whole (§4.4). Whether
   `--remote --file` does too is untested; §4.4 holds either way, because a rerun repairs a partial write.
7. **Rows-read budget.** What is the real `rows_read` of the §6 aggregates over a realistic corpus, and
   how many uncached views a day does that allow on the current plan? Measured before pages ship.
8. **Saved matchup filters** (swubase's `tournament_matchup_filter`) need accounts and so a per-user
   table. v1 filters live in the URL's query string, which is also shareable.
9. **Reusing swubase code verbatim** needs its author's written permission (§2.1). Not needed: nothing
   here depends on it.
10. **Melee's permission** (§5): not needed to run the job by hand; wanted before anything is presented
    as an integration.

---

## Provenance

| document                                                                          | holds                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `docs/research/melee-ingest.md`                                                   | measured endpoints, shapes, WAF behaviour, quirks, etiquette |
| `docs/spec/deckbuilder.md`                                                        | the constraints this widens (§1.1); `parseDeckImport` (§6.1) |
| `CONTEXT.md` → Tournaments (stage 4)                                              | the terms                                                    |
| `scripts/prices.ts`                                                               | the pattern the job copies                                   |
| `the-medo/swu-collection` (AGPL-3.0) → `server/db/schema/`, `server/lib/imports/` | the design and the endpoints; no code copied                 |
