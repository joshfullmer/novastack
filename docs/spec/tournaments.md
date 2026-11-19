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
**built, as one migration, `drizzle/0014_*.sql`** (8 `CREATE TABLE` and their indexes, nothing else; the squash of
what were five during development, none of which reached production; applied cleanly after 0000–0013, and
it leaves every existing table as it was). Foreign keys cascade from `tournaments`, so
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
  venue            text null         // the page header's "Event Venue"
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
  ram              text null         // what the Legends provide together, as a `legends:` value (`rryyyy`); derived
  unresolved       integer           // count of lines that named no single Card; derived
  idx: tournamentId, legendLine, ram

tournament_deck_cards   // PK (deckGuid, cardSlug, board): a derived index of `text`; tournamentId repeats the deck's,
                        // indexed (board, tournamentId, cardSlug), so a period aggregate never joins decks
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

- **Event kind is decided from the name, and stored** (`tournaments.kind`: the list filters and counts by it in SQL; it was derived at read time until then). Melee has no event-type field (research
  `melee-ingest.md`): "Showdown" exists only in what an organizer typed. `eventKind(name)` in
  `src/lib/tournaments/kind.ts` is an ordered list of name rules (first match wins), applied when an event is
  ingested. The categories are **Regional, Showdown, Brawl, Prerelease and Other**, named by the project
  owner; `Other` is what no rule matches, never a guess. Rules are tried most-specific first (Regional,
  Prerelease, Brawl, Showdown), so a name that says two things is the bigger event. A rule is a rule, not
  data: adding one means `pnpm melee --reparse`, which recomputes every stored kind from its name with
  no re-fetch. **Only Showdown has been
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
pnpm melee 485070 [id …]    ingest the given Melee tournament ids into the LOCAL D1; each is rewritten whole.
                            An id already stored is skipped (0 requests) unless --force
pnpm melee --remote 485070  the same into the local AND the PRODUCTION database, so they hold the same events:
                            Melee is fetched once and each database writes only what it lacks. Production
                            asks y/N first (--yes skips it; with no terminal and no --yes the answer is no)
pnpm melee --promote [id …] copy what the LOCAL database holds to PRODUCTION, with no trip to Melee: every
                            event, or the ones named. Rows are compared first and only differences are
                            written, after one y/N. --check stops after the comparison (exit 1: would change).
                            Local is the source; events only production has are left alone
pnpm melee 485070 --persist-to DIR   a throwaway local database, to try a run out
pnpm melee --check 485070   fetch and diff exactly as a real run; write nothing
                            exit 0 current · 1 would change · 2 invariant violated / unreachable
pnpm melee --reparse        rebuild the derived deck columns and card index from stored text (no network)
```

**Local by default; `--remote` is explicit and adds production to local.** Production is only ever written on purpose, after our
own confirmation (`scripts/lib/d1.ts`), which names the Tournament and the statement count.
**Manually triggered, one id at a time**, the way swubase does it: a person supplies the id. Running
an id again with `--force` rewrites it (also how a repair or a decks-arrived-late fill-in works); without
it a stored id is skipped, which keeps a pasted batch of a whole search page cheap. `--check` always fetches. There is no scan, no
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
- **Rounds an organizer created but never ran** (decision 2026-11-19): Melee ends the event with, say,
  Rounds 4–6 listed and empty (492606: 3 played). When the last listed round has no standings, the final
  standings are the last round that has them, provided every later round holds no played match; the
  empty rounds are dropped (so the round count is what was played) and the run says so. This infers
  nothing about who won: it only declines to read an unplayed round as the end. If a later round
  _does_ have results but no standings, the ranking really is unknown and the event is refused
  ("has results but Melee has no standings for it"). Computing a ranking from matches is not done: it
  would need Melee's tiebreakers reproduced exactly.
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

### 4.3.1 Finding the id

The command takes a bare Melee id, so `/tournaments/add` (unlisted, `noindex`) hosts a bookmarklet that,
clicked on a `melee.gg/Tournament/View/<id>` page, copies `pnpm melee <id>`; clicked on any other
melee.gg page, such as the signed-in `/Decklists` search (its rows link `td.TournamentName-column a`
to `/Tournament/View/<id>`), it copies one command for every distinct event linked, in page order. It
runs in the visitor's own browser, reads only the open page, and sends nothing; ingest stays manual and one id at a time
(§1.3). Melee's CSP allows inline `javascript:` URLs (checked 2026-11-19).

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

| group         | key                                                                          |
| ------------- | ---------------------------------------------------------------------------- |
| a Legend      | one Legend slug; a deck counts once per Legend, so shares sum to 3×          |
| a Legend line | `tournament_decks.legendLine` (the sorted trio), stored so grouping is cheap |
| a RAM         | `tournament_decks.ram`, what the three Legends provide together (below)      |

**RAM is how players name a deck** (decided 2026-11-17): YYR, BBG, GGR, RRG. Two decks that share colours
but not RAM (GGR and RRG) are different decks, and decks with different Legends but the same RAM (Viktor and
Muamar in a YYR) are close cousins, so RAM is the middle level: RAM, then Legend line, then deck. It replaces
the old colour-set grouping, which merged GGR with RRG.

- **The spelling is the query language's own `legends:` value**, one letter per **RAM**, not per Legend
  (`yyyyrr` is Yellow 4, Red 2), parsed and formatted by `parseLegendsValue` / `formatLegendsValue`. A Legend
  that does not provide 2 RAM needs no special case, and the same string searches the card database for what
  the deck may play (`/cards?q=legends:rryyyy`).
- **`YYR` is shorthand for `yyyyrr`**: an uppercase letter is a Legend providing the standard RAM
  (`dataset.ramPerLegend`), a lowercase one is a RAM, exactly: the `legends:` grammar's own rule (query
  language §3.3). The shorthand is what the pages show, and is accepted wherever a RAM is typed (`?ram=YYR`);
  `?ram=yyr` is Yellow 2, Red 1. It is only a way to say a RAM whose Legends are all alike: a RAM that cannot be put that
  way has no shorthand, and nothing stored depends on it. The card search takes the same
  spelling (`/cards?q=legends:YYR`).
- **Stored canonical, shown as said.** `tournament_decks.ram` holds the canonical order (colours
  alphabetical: `rryyyy`) so equality and grouping are plain SQL; the pages show it dominant colour first
  (ties in R, Y, G, B order), each letter in its colour (`RamCode`): as the shorthand `YYR` where it has one (every deck today), else one letter per RAM (`yyyyrr`). Parsing accepts any order.
- **Null when it cannot be known**: not three Legends, or one the dataset does not know. Such a deck is
  left out of the RAM groups (and counted in none of their shares) until `pnpm melee --reparse` fills it in.
  It is stamped at ingest and rewritten by `--reparse`, which is also how it follows a change to Legend RAM.
- **Where it shows**: the tier list's RAM group (the default), the matchup matrix (by RAM by default, `?by=line`
  for Legend lines; a RAM matrix is far denser at small event counts), the `ram=` filter on `/decks`, "what's
  played" within one RAM, "which RAMs run it" on a card's Fit page, and a badge on every deck.

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
Every list a page returns is bounded by a constant and says what it left out
(`docs/research/scale-audit.md`, "Status"), and a period aggregate filters on
`tournament_deck_cards.tournament_id`. These are the two things that keep filterable stats affordable.
Caching the rendered pages is **not** built: a `Cache-Control: s-maxage` header alone does not cache a
Worker's response, and the Cache API that does is per data center, so it is a staleness decision, not a
header (audit, "Request path").

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
link (nothing to link to until the list page exists), and production (the tournament migration isn't applied).

**Built: the list page (2026-11-16).** `/tournaments` with two views of the same events, `?view=table`
(a dense ledger) and a Gallery (art-forward), chosen by the app's usual List/Gallery cookie toggle. `getEventList` reads **aggregates only** (counts per
event and one row per Legend), so its cost grows with events rather than decks. Each event carries a
"showcase": the best-placed player who registered a deck, so a card isn't blank when the champion left
their list empty (2 of the 5 events ingested so far); the page says which rank's deck it shows. Also
`noindex`, and unlinked from the nav until launch.

**Built: the statistics pages (2026-11-17).** Every view from the prototype round, as real routes, all
read-only, dynamic and `noindex`:

- **`/tournaments/meta`** (tier list: group by RAM, Legends or By Legend; count all decks, top 8 or
  winners; conversion columns), **`/meta/matchups`** (the matrix, for the eight most-played RAMs or lines) and
  **`/meta/cards`** ("card breakdown", optionally within one RAM or set of Legends).
- **`/tournaments/decks`** (filter by Legend, RAM, a card the deck runs, or player; paged on the server),
  **`/decks/lines`** (shelves per Legend line) and **`/decks/[guid]`** (a deck's path through its event, and
  its list).
- **`/tournaments/cards/[slug]`**: a card's tournament record. Its art with the headline numbers under it
  (share of decks, average copies, sideboard, wins, top 8), and where it fits: does it do better among the
  top 8 and winners than across the field, and which RAMs and Legends run it, with the share of each one's
  decks. It lists no decks (which decks ran a card was judged not worth reading, 2026-11-18). It has no
  picker and no nav item: it is reached by clicking a card in the card breakdown, with a way back, and sits
  under Card breakdown in the sidebar.
- **The bracket** (2026-11-18): an event that had playoff rounds (any round Melee names other than "Round N":
  Quarterfinals, Semifinals, Finals) shows them at `/tournaments/[id]/podium`, the tab labelled **Bracket**,
  as a bracket in the manner of swubase's: the champion above, then each playoff round as a column, each
  match with both players' Legends and the games, the winner picked out, a click to the list they played,
  and lines joining a round to the next. `buildBracket` (pure, `bracket.ts`) puts each round in the order
  that feeds the next, working back from the final, since Melee lists matches by table; it leaves out byes,
  names a champion only from a final with a result, and says whether the rounds halve (so the lines can be
  drawn). An event that was Swiss alone has no bracket and keeps the old podium (top three as panels, the
  rest as tiles and chips), and its tab stays "Podium".
  **Following a player**: pointing at (or tabbing to) a player lights their rows in the bracket and in the
  rail and thickens, in the accent colour, the lines they won along, ending where they lost or at the
  final; on a touch screen a first tap follows and a second opens their deck, and a player with no deck is a
  button that toggles the follow. **A placements rail** beside it groups players by finish (Champion,
  Finalist, Top 4, Top 8, Top 16, as far as the cut went), each with their Legends, record and a deck link,
  and follows the same highlight. A player's slot in the bracket and their tile in the rail are links to their deck (`/tournaments/decks/[guid]`); one with no registered deck says "no deck" and only follows. A match card shows the winner's check and game score, the table and any
  draws; a "Top N" chip names the cut. Not done: opening a deck in place, seeds on the card, a live bracket.
- **Tiers** (2026-11-17). The tier list ranks how a deck _performs_, S down to D, and within a tier by how
  much of the field plays it (the share bar stays beside it). A group's _power_ is its match win rate (a
  draw counts half) pulled toward 50% as if it had also played 10 even matches (`TIER_PRIOR`), so a few
  lucky matches cannot out-rank a long record; tiers are fixed bands of power (S 57%+, A 53–57, B 48–53,
  C 44–48, D below), not a curve, so a thin meta has empty tiers. A group of fewer than `MIN_DECKS` (5)
  decks has no power and is listed apart as unranked. The bands and the prior are constants in `meta.ts` to
  tune against more data.
- **Names in the interface** (2026-11-17): "Legends" is what the interface calls a deck's three Legends
  together (code and this spec still say "Legend line"); the tier list's single-Legend grouping is "By
  Legend". The page of cards is the **card breakdown** (the top-level Cards tab is a different thing: one
  card's usage). The breakdown orders by Percentage (the share of decks that ran a card) or Count (its
  copies), and shows both on the art.
- **The deck pane** (2026-11-17): on a screen 1280px wide or more, `/tournaments/decks` shows the chosen deck
  in a sticky right half instead of going to a new page. The choice is `?deck=<guid>` (so a link, and Back,
  keep it); it stays open as filters change; a plain click on a narrower screen, or a modified click or a
  link opened without JavaScript, still goes to `/decks/[guid]`, which shows the same `DeckDetail`.
  The list is a narrow column (finish, player and RAM, W-L-D; the event is in the pane and the row's
  tooltip) so the pane takes the rest; the filters run in one row above both and apply as you choose or type;
  in the pane the right rail (the card being pointed at, then the path through the event, price and stats) scrolls on its own, so that card stays in view while the cards scroll past. The pane is set off from the list by a divider, not a box.
  **On a screen 1536px wide or more the deck list is exactly the height of the screen**: the window does not
  scroll, the footer steps aside, and three columns scroll on their own (the deck list, the deck's cards,
  and the rail) instead of the pane scrolling inside a page that also scrolls. A page asks for this with
  `fullHeight: true` in its load data; the root layout and the layouts above it hand the height down.
  Narrower, it is an ordinary page.
- **A tournament deck reads like a saved deck** (2026-11-17): `DeckDetail` draws the cards with the same
  components as `/d/[code]` (`components/deck/`: `DeckPreview`, `DeckCardList`, `DeckSideboard`,
  `DeckStats`, `ViewToggle`), so the card pointed at shows large beside the list, cards group by type with
  counts, List / Gallery is the one remembered `deck-cards-view` preference, and the curve, colours, Eddiable
  share and rarities sit beside it. Cards resolve through the dataset by slug; a line it does not know is
  left out and counted in `unresolved`. The **path through the event is walkable**: a round against an
  opponent who has a list links to it (`PathRow.oppDeck`, null for a bye or a player with no list), and in
  It also has Export and Deck image (the saved deck's dialogs), **Open as a new deck** (the list becomes
  the builder's local draft, so it needs no account until Save, and asks before replacing a draft in
  progress), the deck's price, a **Stacks** view (copies fanned behind a card, bottom edges showing) beside
  List and Gallery, and a **clickable cost curve** (a bar lists just the cards at that cost; clicking it
  again, or the chip, shows them all). The saved deck's page shares the Stacks view and the curve filter.
  Not done, from `docs/research/swubase-deck-view.md`: comparing decks (needs a design: an average-deck
  view is the place to start) and URL state for a card dialog.
- **Navigation is a sidebar** (2026-11-17): the section's tabs, the meta and deck sub-tabs and the
  period / kind / field-size row used to take about 300px off the top of every page. They are now one
  collapsible left sidebar (`TournamentsNav`, in `/tournaments/+layout.svelte`): Events, Meta (Tier list,
  Matchups, Card breakdown), Decks (All decks, By Legends), and, on the statistics pages only, the
  scope (Period, Kind, Players) as stacked dropdowns. Collapsed, it is a rail of initials (and the period);
  the choice is the `tournaments-nav` cookie. Below `lg` it is a menu above the page. There is no Cards item: a card's own page (`/tournaments/cards/[slug]`: its record, and where it fits) is reached from the card breakdown, and there is no `/tournaments/cards` index. Pages drop their own
  titles (kept for screen readers) since the sidebar says where you are. The deck pane's split moved to
  1536px wide, since the sidebar takes room. The scope loads in `/tournaments/+layout.server.ts` now, so
  every page under it has `period`, `periods` and `kinds`.
- **Layout** (2026-11-17): the statistics pages use the app's wide container (`max-w-[1800px]`) and fill it:
  the tier list flows into two columns and the card breakdown goes to eight or ten columns of art. Lists of
  rows stay one column: data you scan down is not split in two. The period, kind and field-size choices are dropdowns (`LinkSelect`).

- **The period selector** (`?period=<meta id>` or `?period=all`), shown once a `metas` row exists, narrows
  every one of these: chips up to four choices, a menu beyond. **The default is the current meta** (the
  newest that has started), so a link that names none shows it and the default adds no param to any link;
  all time is `?period=all`. Anything unrecognised means the default. With no meta started, a bare link is
  all time. Nothing is seeded in production; locally one row, WNC, is.
- **Which events count** narrows them the same way: `?kind=<Regional|Showdown|…>` (offered once more than
  one kind has been ingested) and `?min=<8|16|32|64>`, a floor on field size. Both are part of the `Period`,
  so every aggregate honours them, and every link and GET form carries them. Anything unrecognised means
  "any events".

**How it was checked.** The queries are grouped SQL aggregates (`tournament-stats.ts`,
`tournament-decks.ts`), and each is run in tests against a **real SQLite built from our own
migrations** (`test-db.ts`, via `drizzle-orm/sqlite-proxy` over `node:sqlite`) on a six-deck world small
enough to count by hand (`test-world.ts`): shares, win rates, the matrix both ways round, period
boundaries, paging, filters, and a deck's path are each asserted against a number worked out on paper. Run
on the five real events, the pages agree with the prototype's independently computed figures (30 decks,
Mantis Blades in 19 of 32, the top line at 5 decks and 63%). One mismatch was caught that way: the matrix
counted 11 matches against the prototype's 33, because the matrix draws only the eight most-played lines;
the page now says "11 between these lines (of 33 between decks of different lines)".

**Not yet measured or done:** D1 `rows_read` for these aggregates (the harness can't say; open question 7),
a shared-cache header, a site-nav link, and production (the tournament migration is not applied; see `docs/runbooks/tournaments-rollout.md`).

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
   the `has_decks` column that recorded the distinction is gone from the schema and the migration.

### Open

1. **What is an archetype?** §6 groups by RAM, Legend line and Legend because those are readable
   straight off a deck. Whether players name decks some finer way still (by a key non-Legend Card, say) is a
   game-knowledge question, not a data one.
   **Deferred until there is more data (2026-11-17):** cluster decks within a RAM by card overlap, so YYR
   lists that share most of their cards count as one deck whatever their Legends, and the rest as another.
   Measured on 32 decks / 5 events: YYR pairs span 32–85% shared main-deck copies (a gap between 62% and 45%;
   some same-Legend pairs share only a third, some different-Legend pairs 85%), and pairs across different
   RAMs have a median 14% (max 68%). Open: the threshold (about 60% on that sample, too few to fix), whether
   clusters are stored (a column filled by a batch pass, so identity stays stable) or computed per request
   (reads every deck's cards), what to call and label a cluster, and excluding decks with incomplete lists.
2. **Which metas?** Decided 2026-11-17: a meta is a name and a **date range**, and anything that changes the
   game can start one (a set release, a banlist or errata). For now there is one, **WNC** (Welcome to Night
   City), from its retail release, 2026-11-06, open-ended. **Where the rows live is open**: the `metas`
   table, hand-seeded, or a constant in code (a meta changes a few times a year, needs a deploy anyway, and
   a constant needs no seeding on prod). Not decided; to settle in the schema review. Locally the one row
   is seeded by hand, replacing the two demo rows.
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
