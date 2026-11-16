# Research: what swubase.com surfaces, and what that implies for Novastack's tournament pages

Gathered **2026-11-16**. Primary source is the swubase source, a shallow clone at commit `2f9fda0`
(2026-11-10) of `github.com/the-medo/swu-collection`, read in place. Paths below that have no host are
relative to that repo's root (frontend code is under `frontend/src/`). The live site, `https://swubase.com`,
was used only to confirm what a visitor sees; see "Requests made" for how much. Tags: **[src]** read in the
source, **[live]** seen on swubase.com, **[inferred]** my reading, **UNVERIFIED** not reached. Nothing here
is third-party. Per the standing rule `/llms.txt` and `/docs/llms.txt` were checked first: both return the
same 2,203-byte SPA shell with status 200, so neither exists.

**Licence.** swubase is AGPL-3.0, Novastack is public and unlicensed. This note describes features and
data needs in my own words; it contains no code, SQL or long strings from their repo, only route paths and
table/column names as citations.

## Verdict

- **swubase is one analytic engine behind many doors.** Almost every tournament surface (a single event,
  a whole meta, a curated "week") is the same four views (Meta Analysis, Matchups, All Decks, Card
  Statistics) fed with a different set of tournaments. Scoping Novastack's pages is mostly scoping those four
  views once, not building twelve pages. **[src]** `components/app/tournaments/TournamentTabs/*`,
  `components/app/meta/MetaTabs/MetaTabs.tsx`.
- **Their meta, matchup and deck views are computed in the visitor's browser** from a bulk download of every
  deck and match in the selected tournaments, cached in IndexedDB. Only per-card statistics are precomputed
  server-side. **[src]** + **[live]** (network log: one list call, then one bulk POST).
- **Their most elaborate surfaces are the ones that need data Novastack does not ingest or cannot yet
  support:** tournament type/tier, location, map, live weekend, streams, saved filters, teams, personal
  statistics. All need curated or user-entered data, accounts, or polling.
- **What Novastack already has covers the core.** Standings, decks, card index and matches are enough for
  every deep surface below except the type/tier filter and anything live. The binding limit is volume
  (32 decks across 5 events, per the prototype notes), not schema.
- **Cheapest valuable set:** full-standings event page with deck drawers, the by-Legend share table with an
  All / Top 8 / Winners toggle and sample-size masking, an All Decks table with filters, card inclusion per
  Legend line, a `metas` period selector. The matchup matrix and everything curated or live wait.

## 1. Site map

Router: TanStack Router file routes, `frontend/src/routes/` (115 files), nav in
`components/app/navigation/LeftSidebar/LeftSidebar.tsx`. "Auth" is from the `_authenticated` route group or
a sign-in wrapper component **[src]**; I did not sign in anywhere.

### Public, tournament / meta / deck / card (the ones this note is about)

| Route                                                                                           | Purpose                                                                                 | Auth                             |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| `/`                                                                                             | Home with three modes: `snapshot` (meta of the last ~2 weeks), `today`, `live`          | no                               |
| `/meta`                                                                                         | Meta for a (format, meta period, min tournament type): the four analysis tabs           | no                               |
| `/tournaments` → `/tournaments/featured`                                                        | Redirect; Featured = curated tournament groups for the selected meta                    | no                               |
| `/tournaments/all`                                                                              | Filterable table of every tournament                                                    | no                               |
| `/tournaments/planetary-qualifiers`                                                             | Week-by-week analysis of the PQ circuit                                                 | no                               |
| `/tournaments/map`                                                                              | Map of tournaments with filters                                                         | no                               |
| `/tournaments/$id` → `/details`                                                                 | One tournament; tabs `details`, `meta`, `matchups`, `decks`, `card-stats`               | no                               |
| `/tournaments/$id/community-content`, `/photos`                                                 | Linked articles/videos and photo albums for the event                                   | no (posting needs sign-in)       |
| `/tournaments/calendar`                                                                         | Your saved tournaments, calendar + ICS subscription                                     | **yes**                          |
| `/decks/public`, `/decks/favorite`, `/decks/your`, `/decks/folder/$id`                          | Browse / favourites / own decks / folders                                               | public list; others need sign-in |
| `/decks/$deckId`, `/decks/$deckId/edit`                                                         | Deck view; builder                                                                      | view no; edit yes                |
| `/decks/tournament`                                                                             | "Coming soon" placeholder for browsing tournament decks (`routes/decks/tournament.tsx`) | no                               |
| `/cards/search`, `/cards/detail/$id`, `/cards/sets/$code`, `/cards/groups/$id`, `/cards/promos` | Card database: search, card page, set, groups, promos                                   | no                               |
| `/comparer`                                                                                     | Compare several decks (average-deck view)                                               | no                               |

### Public, everything else (one line each; not studied)

| Route                                                                                                                                                                                          | Purpose                                                                                  | Auth                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| `/collections/public`, `/collections/$id`, `/wantlists/public`, `/wantlists/$id`, `/lists/$id`                                                                                                 | Public collections, wantlists, card lists                                                | no (own: yes)             |
| `/limited`, `/limited/public`, `/limited/deck/$id`, `/limited/pool/$id/detail`                                                                                                                 | Sealed-pool builder and shared pools                                                     | creating needs sign-in    |
| `/teams`, `/teams/$teamId`, `/teams/$teamId/statistics/*`                                                                                                                                      | Teams; team stats (dashboard, decks, history, leader-and-base, matchups, members, meta)  | stats yes                 |
| `/users/$userId`, `/users/$userId/tournaments`, `/calendar`                                                                                                                                    | Account profile with tabs (decks, collections, albums, tournaments, reports, currencies) | no                        |
| `/creators`, `/creators/$slug`, `/content`, `/content/$id`                                                                                                                                     | Creator hub and content feed (labelled Beta)                                             | no                        |
| `/forum`, `/forum/$id`, `/forum/new`                                                                                                                                                           | Forum                                                                                    | posting yes               |
| `/artists`, `/artists/$key`, `/albums/$id`, `/galleries/$id`, `/battlefield-showcase`                                                                                                          | Artist, album, gallery, showcase pages                                                   | no                        |
| `/statistics/*` (dashboard, decks, history, leader-and-base, matchups, meta)                                                                                                                   | **Your own** game-result statistics (not tournaments)                                    | **yes** (sign-in wrapper) |
| `/tools`, `/tools/deck-format-converter`                                                                                                                                                       | Deck-format converter                                                                    | no                        |
| `/about`, `/support`, `/terms`, `/privacy`, `/auth/*`, `/mcp/login`                                                                                                                            | Static, auth                                                                             | no                        |
| `_authenticated`: `admin`, `battlefield`, `collections/import`, `creator-studio/*`, `crossfire/*` (online play), `following`, `messages`, `notifications`, `settings/*`, `shop`, `mcp/consent` | Account features                                                                         | **yes**                   |

Two things the map shows that matter here. **There is no public player page by tournament player name**
**[src]**: the only per-player surfaces are an account profile with a Tournaments tab (accounts linked to a
Melee identity, tables `melee_connection`, `user_melee_tournaments`) and a private "watched players" list.
And **card pages carry no tournament statistics**: the card page's Decks tab lists public user decks
containing the card (`components/app/cards/CardDetail/CardDetailDecks.tsx`); card statistics from
tournaments live only inside the tournament/meta Card Statistics tab.

## 2. Tournament list and groups

### 2.1 `/tournaments/all` and the tournaments tab of `/meta`

- **Shows:** a table with columns thumbnail, name, winning deck (Leader and Base art), date, type,
  format, location (country plus continent), players, and a row menu. **[src]**
  `components/app/tournaments/TournamentList/useTournamentTableColumns.tsx`. **[live]** the `/meta`
  Tournaments tab shows exactly these, e.g. a row with name, 11/15/2026, "Planetary Qualifier", "Premier",
  "US North America", 63 players.
- **Filters/sorts:** type, date-from, continent, sort field + direction, "show future" toggle; plus format
  and meta period from the page header. All state lives in the URL (`tf*` params).
  `components/app/tournaments/TournamentFilters/TournamentFilters.tsx`.
- **Interactions:** row click opens the event; column headers sort **[live]**; a quick-view dialog exists.
- **Data/endpoint:** `GET /api/tournament` (`server/routes/tournaments/get.ts`) with filters for type,
  minimum type, season, set, meta, location, continent, minimum attendance, format, days, date range,
  limit/offset, sort/order. Each row carries the winning deck, via a subquery for placement 1 on
  `tournament_deck` joined to `deck`. Tables: `tournament`, `tournament_type`, `meta`, `tournament_deck`,
  `deck`, `user` (a tournament is created by a user). **[src]**

### 2.2 `/tournaments/featured` and tournament groups

- **Shows:** for the selected meta, a stack of curated groups (e.g. "PQ Week N"), each with its tournaments
  and winning decks, and a button that opens the meta analysis for just that group. **[src]**
  `components/app/tournaments/pages/TournamentsFeatured/`, `TournamentGroup/TournamentGroup.tsx`.
- **Data/endpoint:** `GET /api/tournament-groups` (`server/routes/tournament-groups/get.ts`), tables
  `tournament_group` (name, meta, position, description, visible), `tournament_group_tournament`
  (membership, position). Groups are admin-curated, not derived. **[src]**
- **Precomputed per group:** `tournament_group_stats` (imported / with-data / total tournaments, decks,
  attendance) and `tournament_group_leader_base` (per Leader+Base: winner, top-8 and total counts), fed by
  `server/lib/card-statistics/update-tournament-group-statistics.ts` and
  `server/lib/tournament-group/*`.

### 2.3 `/tournaments/planetary-qualifiers`

- **Shows:** a week-by-week view of one circuit: a bump (rank-over-time) chart and a table of how each
  Leader's share moved week to week, a side table of shifts or week overview, "unusual champions", and
  collapsible week columns listing that week's tournaments and winning decks. **[src]**
  `components/app/tournaments/pages/TournamentsPlanetaryQualifiers/*`.
- **Controls (URL):** which measure (tournaments, champions, top 8, total), count vs percentage, chart vs
  table, side view (by week or by deck key), selected week.
- **Data:** the tournament groups above whose names start with "PQ Week", with their group leader-base
  counters. **[inferred]** from the page's use of `usePQTournamentGroups`. Not visited live.

### 2.4 `/tournaments/map`, `/tournaments/calendar`

- **Map:** pins clustered on a canvas, week range slider, filters for date range, tournament type (max 3),
  format (3 ids), and "saved only"; pin details on click. Data from `GET /api/tournament/map` and
  `tournament.coordinates` + `additional_info`. **[src]** `pages/TournamentsMap/*`.
- **Calendar (sign-in):** the user's saved tournaments (`user_tournament_save`), agenda and calendar views,
  an ICS subscription feed with privacy and week-start settings (`server/routes/calendar-feed.ts`,
  `user_calendar_subscription`). **[src]**

## 3. Tournament detail (`/tournaments/$id/*`)

Header: tournament name, a Melee.gg button, tab bar: Details & Bracket, Meta Analysis, Matchups, All Decks,
Card Statistics, Community content. **[live]** + `components/app/tournaments/TournamentTabs/TournamentTabs.tsx`.
Admins get an extra menu (edit, import from Melee, clear data, recompute statistics, send Discord results,
generate screenshots) hidden by permission. **[src]** `TournamentDetail/TournamentDetail.tsx`.

**Data loading, for every tab:** three calls: the tournament (`GET /api/tournament/:id`), its decks
(`.../:id/decks`) and its matches (`.../:id/matches`), put into one client-side store, and the tabs compute
from that. `components/app/tournaments/TournamentMeta/TournamentDataLoader.tsx`,
`server/routes/tournaments/_id/{decks,matches}/get.ts`.

### 3.1 Details & Bracket

- **Shows [live]:** "Tournament results Top 8": the champion, a "Final standings" list of 8 players grouped
  Champion / Finalist / Top 4 / Top 8, each with a "view deck" button and an open-in-new-tab link; below it
  an elimination bracket (Quarterfinals, Semifinals, Final) with game wins per player and the match winner
  marked; then an Overview panel (date, meta and season, type with a Major badge, format, location,
  players and, for two-day events, the day-two count), photo albums, linked reports, attachments.
- **Not shown:** the full Swiss standings or round-by-round pairings. That event had 63 players and the
  panel lists 8. **[live]** Full ranking is only visible as placement in the All Decks table, and only for
  players who have a deck. **[src]**
- **Interactions:** clicking a player opens that deck in place; hover/click highlights a player's path
  through the bracket; a "back" returns to the bracket. `TournamentTopBracket/*`.
- **Derivation:** the bracket is built from the match rows plus top-N placements by deck; the size comes
  from a per-tournament setting (`none`, top 16, top 8, top 4). `TournamentTopBracket/buildBracket.ts`,
  `tournament.bracket_info`. **[src]**
- **Data:** `tournament` (type, location, days, day-two player count, attendance, bracket info, Melee id,
  imported flag), `tournament_deck` (placement, record, points, Melee decklist guid, Melee username),
  `tournament_match` (round, both usernames, both deck ids, both players' points, game wins/losses/draws,
  result, bye flag).

### 3.2 Meta Analysis (event, meta period, or group; same component)

Described once in section 4.1. In an event it uses that event's decks only.

### 3.3 Matchups

Described once in section 4.2.

### 3.4 All Decks

- **Shows:** a "top Leader decks" strip, then a table: placement `#`, Deck (Leader/Base labels), Score
  (record), Player, and buttons that open the main deck and sideboard. Selecting a row opens the deck in a
  side panel (the same deck viewer as a user deck) and, for a tournament deck, that deck's path through the
  event (opponents, scores). **[src]** `TournamentDecks/*`,
  `components/app/decks/DeckContents/DeckMatches/DeckMatches.tsx`.
- **Filters:** Leader picker, Base picker, aspect multi-select, a "deck key" set by clicking a bar or cell in
  the meta/matchup views, and a reset-all button (counts active filters). All in the URL. The selected deck
  is in the URL too (`maDeckId`), so a deck is linkable.
- **Comparison floater:** once a deck key is chosen a panel offers presets (Best 5, Best 10, Top 8, Top 16
  of that key) that send the chosen decks to `/comparer`, plus "view in Card Stats / Matchups / Meta" jumps.
  `TournamentDecks/TournamentDeckKeyFloater.tsx`.
- **Data:** same as 3.1 plus `deck`, `deck_card`, `deck_information` (aspect counts, base aspect).

### 3.5 Card Statistics

Section 5.

### 3.6 Community content, photos

User-posted links and albums attached to the event: tables `user_tournament_attachment`, `user_album`. Needs accounts and moderation. **[src]** Light
depth, not applicable to Novastack now.

## 4. Meta and statistics (`/meta`, and the same tabs inside an event or group)

`/meta` is a page whose header picks **format** (format ids 1-10 in the URL schema, filtered by a helper), **meta period**
(a "meta" is a named set-and-season window), and **minimum tournament type** (default Planetary Qualifier);
tabs are Tournaments (with a count badge), Meta Analysis, Matchups, All Decks, Card Statistics. `page` is a
URL param. `routes/meta/index.tsx`, `components/app/meta/*`. **[live]** default state: Premier, "Homeworlds
[Premier - HMW S2]", Planetary Qualifier or higher, 42 tournaments. Selecting a tournament group instead
(`maTournamentGroupId`) restricts the same page to that group and swaps the header for a week selector.

**How it loads [live]:** after the page shell, `GET /api/meta`, `POST /api/cards`, then one
`GET /api/tournament?...limit=250` for the matching tournaments and one `POST /api/tournament/bulk/data`
with their ids; no other tournament calls. **[src]** the bulk endpoint returns every match row and every
deck (joined to deck and its aspect info) for the ids given, and the client keeps them in IndexedDB keyed by
each tournament's update time, refetching only stale ones (`api/tournaments/useGetBulkTournaments.ts`,
`server/routes/tournaments/bulk/data/post.ts`). Payload size: UNVERIFIED (not measured).

### 4.1 Meta Analysis tab

- **Shows [live]:** "Total decks analyzed: 2533"; a ranked bar chart of Leaders (Wicket, Ahsoka Tano,
  Director Krennic ... with counts 275, 267, 215 ...), an "Unknown" bucket for decks that could not be read
  and an "Others" bucket; a "Highlight leader" search box; a note that win rates are computed from filtered
  decks, so top-8 decks naturally score higher, and that mirror matches are not removed.
- **View modes:** Chart, Table, Plot ("win rate and meta share", a scatter), APR ("adjusted performance
  rate"). `ViewModeSelector.tsx`, `TournamentMetaMap.tsx`, `tournamentMetaApr.ts`.
- **Part of the field ("meta part"):** All Decks, Top 8, Champions; also Day 2 and Top 64 when every
  tournament in scope has two days. Placements are decks' `placement`; Day 2 uses the day-two player count.
- **Group-by ("meta info", seven options):** Leaders, Leaders & Bases, Bases, Aspects, Aspects (Base),
  Aspects (Detailed), Sets. A deck's key is computed in the browser from its Leader/Base card ids and its
  aspect counts (`TournamentMeta/tournamentMetaLib.ts`).
- **Table columns [src]:** for each key, deck count, share, wins, losses, win rate (from the deck's
  own record), and for each other part its count, share and a **conversion** (the share of all decks with that
  key that reached top 8 / day 2 / top 64 / won).
- **APR [src]:** a custom score comparing a key's share at a later stage to its share at an earlier one
  (field to day 2, day 2 to top 8, field to top 8, top 8 to champion, or combined), scaled by the log of the
  sample size so small samples do not dominate; shown as a chart.
- **Interactions:** clicking a bar or cell sets the deck key and routes to All Decks / Card Stats /
  Matchups; chart colours and gradients by aspect; everything URL-driven (`maMetaPart`, `maMetaInfo`,
  `maViewMode`).
- **Data:** `tournament`, `tournament_deck` (record, placement), `deck`, `deck_information`, plus the card
  list (`POST /api/cards`) for names, aspects, sets.

### 4.2 Matchups tab

- **Shows:** a matrix of the chosen key against itself (rows and columns are Leaders, Leader+Base, ...);
  each cell is the row's result against the column. **[src]**
  `TournamentMatchups/TournamentMatchups.tsx`, `hooks/useMatchupData.ts`.
- **Display mode (4):** match wins/losses, match win rate, game wins/losses, game win rate; cells are
  coloured by win rate.
- **Match filter:** all matches, only matches whose players reached day 2, only top-8 matches, or custom
  (minimum round, minimum points both players had entering the match). Group-by is the same seven options.
- **Row/column filters:** a text box, a popover with aspect filters, and an option to lock rows and columns
  to the same filter. Signed-in users can **save** these (`tournament_matchup_filter`: user, format,
  mirrored flag, row and column filter JSON) and re-apply them from a per-format list. This is the only
  server-persisted state in the analytics surfaces. Design notes: `.ai/planning/feature-matchup-filters/`.
  Row/column filtering is available only for the Leaders and Leader+Base groupings.
- **Drill-down dialog:** clicking a populated off-diagonal cell opens a near-full-screen dialog that lists
  the underlying matches (tournament and link, round, each player with deck label and points entering the
  match, game score), with its own filters (minimum event size, minimum round, deck A result, a final
  placement percentile of both players, "only elimination rounds"); picking a deck label opens that decklist
  in a side panel. Design notes: `.ai/planning/feature-matchup-dialog/`. **[src]**
- **Data:** `tournament_match` with both deck ids (the join from match to deck is a stored column, not a
  lookup) plus `tournament_deck` and `deck`.

### 4.3 Meta periods and groups

A **meta** row names a window (set, season, name, start date, format). `meta` is both a filter on
`tournament` and a stored key for card statistics. **Groups** (section 2.2) are a second, hand-curated
axis, used for "weeks" and for the home snapshot. **[src]** `server/db/schema/meta.ts`, `tournament_group.ts`.

### 4.4 Home snapshot

Home mode "snapshot" shows the meta of roughly the last two weeks, from stored daily sections
(`daily_snapshot`, `daily_snapshot_section`, prepared by `server/crons/prepare-daily-snapshot.ts`; the base
date logic is in `server/lib/daily-snapshots/prepare-tournament-group.ts`). Light depth.

## 5. Card statistics (tournament, meta, group)

- **Shows:** five views: All Cards, Aspect, Leader, Leader/Base, and "Matchup stats". Each lists cards with
  main-deck copies, sideboard copies, total, average copies, number of decks and a win rate. **[src]**
  `components/app/card-stats/*`.
- **Controls:** sort by (MD count, SB count, total, avg MD, avg total, deck count, win rate), group by
  (none, card type, cost, set), a minimum deck count, name search; leader/base pickers on the last three
  views. A tooltip on the `/meta` version warns the stats cover the whole meta and **ignore** the "minimum
  tournament type" filter, because those are precomputed per meta, not per selection. **[src]**
  `meta/MetaTabs/MetaTabs.tsx`.
- **Precomputed [src]:** per card, per scope (tournament, meta, group), optionally per Leader and per
  Leader+Base: main-deck count, sideboard count, deck count, and match wins/losses weighted by copies of the
  card in the deck. Tables `card_stat_tournament*`, `card_stat_meta*`, `card_stat_tournament_group*`
  (`server/db/schema/card_stats_schema.ts`, `card_stats_tournament_group_schema.ts`); written by
  `server/lib/card-statistics/{tournament,meta,tournament-group}-statistics.ts`, automatically after a
  Melee import and by an admin "recompute" button (`server/routes/card-stats/compute.ts`).
- **Endpoints:** `GET /api/card-stats` (by `meta_id` | `tournament_id` | `tournament_group_id`, optional
  leader/base), `/deck-counts`, `/top-played` (top cards per Leader), `/matchup-stats` and
  `/matchup-stats/decks`.
- **"Matchup stats" [src]:** card win rate inside a chosen deck-vs-deck matchup. It does its work on request
  into temporary tables (`card_stat_matchup_*`) that a cron then deletes
  (`server/crons/cleanup-card-stats.ts`, which keeps only rows from the last 15 minutes). Costly shape;
  see section 9.

## 6. Decks

- **Browse (`/decks/public`) [src]:** filters Leader, Base, aspects, format; sort by last updated,
  created, name, format, favourites, "score" (a stored `deck_information.score`). Same table component on
  the card page and the user profile. Folders, favourites, "your decks" need sign-in.
- **Deck view [src]:** tabs Decklist / Charts (cost curve, aspect) / collection ownership (signed-in);
  layouts and group-by selectors; a deck image generator with customisation; price source selector; the
  tournament path panel when the deck came from an event (section 3.4); comments/discussion.
- **Export/share:** download `.json` or `.txt`, copy JSON or text, copy link (with a private warning),
  duplicate, favourite, send to the comparer. `decks/DeckContents/DeckActionsMenu/*`.
- **Import:** paste or pull by link from five sites (swudb, swuforge, holoscan, protect-the-pod, Melee) with
  a stored source reference for later refresh. `server/lib/decks/deckBuilders.ts`,
  `server/routes/decks/import/post.ts`, table `deck_import_source`.
- **Tournament decks are ordinary decks.** A tournament deck is a row in `deck` linked from `tournament_deck`
  (Novastack's spec §2.1 says the owner is a system account; I did not confirm that in their import code); this is why every deck feature (view, export, compare) works on them for
  free. Novastack deliberately does not do this (spec §2.1).
- **Thumbnails/images:** `POST /api/decks/thumbnails`, `POST /api/tournament/thumbnails`; a Playwright
  "screenshotter" renders four views per imported tournament (bracket, meta by Leader+Base for all decks,
  the same for top 8, winning deck) to object storage, used for Discord result posts
  (`server/screenshotter/*`, `types/Screenshotter.ts`). Heavy; not a surface a visitor sees.
- **Builder:** `/decks/$id/edit` with a "most played cards" helper
  (`components/app/decks/Deckbuilder/MostPlayedCards.tsx`); not studied further (Novastack has its own).

## 7. Card pages

- **Search (`/cards/search`) [src]:** name, card text, aspects (exact, include none), types, arenas, ranges
  for cost/power/HP/upgrade power/upgrade HP, traits, keywords, uniqueness, variants, artist; sort by name,
  number, cost, type, rarity, aspect, relevance; several result layouts. State is in the URL.
  `components/app/cards/AdvancedCardSearch/*`.
- **Card page [src]:** tabs Card Details, Variants, Decks (public user decks), Price history (with currency
  conversion), Rules discussion (comments, signed-in to post); add to collection/wantlist/list. No
  tournament data.
- **Sets, groups, promos** are galleries (`components/app/cards/CardHome/*`).

## 8. Live weekends, streams, players, teams, collections (lighter depth)

- **Live mode on the home page.** Purpose: during a weekend with up to ~30 simultaneous qualifiers show
  each one's status (upcoming, running, finished, unknown), player count, country, current round and matches
  remaining, undefeated players from round 4, a mini bracket once top 8 starts, a Melee link and a stream
  link, the winning Leader+Base for finished ones, and a pie of the weekend's meta from the group counters.
  Design: `.ai/planning/feature-live-tournaments/{description,live-flow}.md`.
  **Data it needs:** a curated weekend and its tournaments (`tournament_weekend`,
  `tournament_weekend_tournament_group`, `tournament_weekend_tournament`), a Melee id per tournament, and
  during the event live copies of standings and matches (`player`, `tournament_standing`,
  `tournament_weekend_match`, `tournament_weekend_player`), refreshed by a scheduled job that polls Melee's
  details endpoint (`server/crons/check-live-tournaments.ts`, `server/lib/live-tournaments/*`). Signed-out
  visitors refetch every 60 seconds (`components/app/home/LiveTournamentHome.tsx`). The planning doc says
  the push channel (WebSocket) was still a no-op; the ws route file exists (`server/routes/ws/`), its
  current state UNVERIFIED.
- **Streams.** Users submit YouTube/Twitch links per tournament (`tournament_weekend_resource`), with
  moderation and a rate limit (`server/lib/live-tournaments/resourceSubmission*.ts`). Needs accounts.
- **Watched players.** A signed-in user saves a Melee display name (`player_watch`) and sees that player's
  latest match per live event. Players are keyed by display name (`player` table, optional link to a user).
- **Teams.** Team pages with an events tab and a statistics area that reuses the personal-statistics
  views over members' game results (`routes/teams/$teamId/statistics/*`). Needs accounts and user-reported
  games (`game_result`, with Karabast online-play integration).
- **Collections/wantlists, Sealed, Crossfire (online play), forum, creators, shop:** outside tournament
  scope; each needs accounts.

## 9. What this implies for Novastack

**Analysis, not observation.** Novastack's grouping is by three Legends (spec §6), a Cyberpunk deck has
Legends, a 40-50 card main deck and a 7-card sideboard, and there is no Base, no Aspect, no Day 2 and no
"set of the Leader" key. Novastack's ingest has standings (full), decks with a Card index, matches (round,
players, game counts, kind), rounds, players (Melee id) and hand-seeded `metas` (spec §3).

### 9.1 Surface by surface

| swubase surface                                                      | Novastack status                                                                   | Notes                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournament list: name, date, players, winner, link                   | **Can show now**                                                                   | Winner's Legends art needs a deck; the prototype notes 2 of 5 winners have none. Link to Melee is the tournament id.                                                                                              |
| List filters: type/tier, location/continent, days                    | **Needs data we don't ingest**: tournament type, country, event days               | Only organizer and player count come from Melee. Could be hand-tagged or inferred; not free.                                                                                                                      |
| List sort and date/meta filters, URL state                           | **Can show now**                                                                   | `metas` gives the period filter.                                                                                                                                                                                  |
| Featured groups / "PQ weeks"                                         | **Needs data**: a hand-curated grouping                                            | `metas` plus a date range covers most of it without a new table.                                                                                                                                                  |
| PQ circuit week-to-week page                                         | **Not applicable / premature**                                                     | Needs a circuit with tiers and weeks; one-event-a-week volume cannot fill it.                                                                                                                                     |
| Map; calendar and ICS feed                                           | **Needs data**: location, saves, accounts                                          | Low value at this volume.                                                                                                                                                                                         |
| Event page: top-8 list, champion, bracket                            | **Can show now**                                                                   | Rounds are numbered by button order with names like Finals (spec §4.1); bracket derives from matches.                                                                                                             |
| Event page: **full standings, per-round pairings**                   | **Can show now, and better than swubase**                                          | They show only top N plus decks. Novastack stores all standings and all matches.                                                                                                                                  |
| Deck drawer / "path through the event"                               | **Can show now**                                                                   | Join a player's matches to opponents' Tournament Decks. Notice "no deck" must render (45% of players).                                                                                                            |
| Meta share by key, Chart/Table, All/Top 8/Winners                    | **Can show now**                                                                   | Keys: Legend, Legend line, RAM colour set. Drop Bases, Aspects, Sets, Day 2, Top 64.                                                                                                                              |
| Plot: win rate vs share                                              | **Can show now**                                                                   | Needs the sample-size mask (under 5 decks: count only).                                                                                                                                                           |
| Conversion columns (share reaching top 8 / winning)                  | **Can show now**                                                                   | Same inputs as the table.                                                                                                                                                                                         |
| APR score                                                            | **Can compute, not yet worthwhile**                                                | Their own formula needs a lot of decks per stage to mean anything.                                                                                                                                                |
| Matchup matrix, four display modes                                   | **Can compute, data too thin**                                                     | 33 usable cross-deck matches over 8 lines (prototype notes). Game-level modes use per-match game counts, which Novastack has; true per-game results (who went first, which game) are not ingested by either site. |
| Matchup filters: minimum round, minimum points, top-8 only           | **Can show now**                                                                   | All derivable from `tournament_matches` and `standings`; "points entering the match" would need cumulative points per round, derivable but a computation to write.                                                |
| Matchup drill-down dialog (matches + decklists)                      | **Can show now**                                                                   | Highest value part of the matrix once volume exists.                                                                                                                                                              |
| Saved matchup filters                                                | **Needs accounts and a per-user table**; Novastack has accounts                    | Spec §7 open item 8 already chooses URL state instead. Agree.                                                                                                                                                     |
| All Decks table with Leader/colour filters, deck link                | **Can show now**                                                                   | Add card filter ("decks running X") which swubase lacks on this page.                                                                                                                                             |
| Compare top decks of a key                                           | **Can show later**                                                                 | Needs a compare view for Tournament Decks.                                                                                                                                                                        |
| Card statistics: MD/SB, avg copies, deck count, win rate; per Leader | **Can show now**                                                                   | `tournament_deck_cards` is built for this; group by card type/cost from `cards.json`. Skip "Matchup stats".                                                                                                       |
| Card page: "decks that ran this card" with finishes                  | **Can show now, and is a gap in swubase**                                          | swubase's card page links only user decks; tournament usage per card is a cheap, distinctive addition.                                                                                                            |
| Deck import/export, images                                           | **Mostly built** (deckbuilder)                                                     | "Open this Tournament Deck as a new Deck" is the useful link; `parseDeckImport` already reads the text.                                                                                                           |
| Community content, photos, attachments, reports                      | **Needs user-generated content**                                                   | Skip.                                                                                                                                                                                                             |
| Live weekend, streams, watched players, push updates                 | **Needs data we won't ingest**: status, round progress, streams, accounts, polling | Spec rules out live (finished events only). Skip.                                                                                                                                                                 |
| Teams, personal statistics, game-result entry                        | **Not applicable**                                                                 | Needs user-reported games; no equivalent.                                                                                                                                                                         |
| Discord posts, Playwright screenshots                                | **Not applicable**                                                                 | A static OG image is a separate, Workers-Paid-gated question (prior spike).                                                                                                                                       |
| Home snapshot of the last two weeks                                  | **Can show now**                                                                   | A trailing window over the same queries.                                                                                                                                                                          |

### 9.2 Most value per unit of effort

1. **Event page with full standings and deck drawers.** Data is in hand, and it beats swubase's own event
   page (top N only). Every other surface links into it.
2. **By-Legend meta table with All / Top 8 / Winners and conversion columns.** The prototype's variant C
   plus swubase's "meta part" idea. One aggregate, one table, URL-state filters; works on thin data if the
   sample-size mask ships with it.
3. **All Decks table with Legend and card filters**, with the deck's path through the event on selection.
   Also the answer to "show me everything" for a window.
4. **Card inclusion per Legend line, and a "played in tournaments" block on card pages.** The index exists
   for exactly this; swubase has nothing on its card page to copy, so it is a differentiator rather than
   a port.
5. **The period selector.** It is a `metas` row plus a query parameter and makes every other page
   comparable across time.

Waiting on volume, not on design: the matchup matrix and APR. Waiting on data nobody has asked for yet:
type/tier, location.

### 9.3 Traps and costly shapes

- **Precomputed counter tables, nine ways.** swubase keeps card counters for tournament, meta and group,
  each at three granularities (all, per Leader, per Leader+Base), plus group leader-base counters and
  snapshot tables, refreshed by import hooks, an admin button and crons. Their "min tournament type"
  caveat on Card Statistics is a symptom: the precompute cannot honour a filter it wasn't built for.
  Novastack's SQL-over-ingested-rows plan avoids that; hold it until measured `rows_read` forces it (spec §6).
- **Computing the whole meta in the browser.** It works for them because they cache in IndexedDB and have a
  Postgres server; a 2,500-deck bulk download is paid on first view. On Workers/D1 the equivalent is a
  fat JSON response per uncached visit. Prefer server-side aggregates with `Cache-Control`.
- **Request-time temp tables plus a cleanup cron** for card matchup stats. Skip the feature.
- **Live polling and push.** Their own planning notes record a ~2 MB live response for a 32-tournament
  weekend (`.ai/planning/feature-live-tournaments-data-and-websockets/description.md`), a 60-second
  refetch for anonymous visitors, and a push channel that was a stub. Each is a standing cost for a
  surface that only matters on tournament weekends.
- **User-created tournaments plus moderation.** Their tournaments are entered by users and approved,
  which is why `type`, `location`, `days` and `bracket_info` exist. Novastack ingests by id; resist
  copying the fields before there is a way to fill them.
- **Making tournament decks ordinary decks.** It buys free reuse but couples results to accounts, versions
  and visibility; the spec's separation is right.
- **Saved filters, teams, streams and reports** each need accounts, moderation and rate limits. None is
  needed to answer "what is winning".

## Requests made to swubase.com

- 2 plain GETs (`/llms.txt`, `/docs/llms.txt`), 1 second or more apart, identifying User-Agent.
- 2 full browser page loads (`/meta`, then a PQ tournament page) and 1 client-side tab change in the SPA
  (the `/meta` Tournaments tab); one stray click sorted a table column client-side, no request.
- **Honest accounting:** the browser's own network log for the session lists **120 requests** to
  swubase.com, because each full page load pulls scripts, fonts, images and its API calls. Counted that way
  the "about 40" budget was exceeded; counted as pages and explicit API-bearing navigations it was 5. No
  login, no form submission. Screenshots: none. Browser snapshots are in `.playwright-mcp/` (git-ignored).

## UNVERIFIED

- Pages not loaded live: `/tournaments/featured`, `/tournaments/all`, `/tournaments/planetary-qualifiers`,
  `/tournaments/map`, the Matchups, All Decks and Card Statistics tabs, deck and card pages, the home
  Live mode. Their descriptions are from source only.
- That `/decks/tournament` is still a placeholder on the live site (source says "coming soon").
- Size of the bulk tournament payload; whether the live WebSocket route is now active; which formats the
  production site actually lists beyond Premier.

## Provenance

| source                                                                                                | used for                                      |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `frontend/src/routes/`, `components/app/{tournaments,meta,card-stats,decks,cards,home}/`              | pages, filters, interactions                  |
| `server/routes/{tournaments,tournament-groups,card-stats,meta,decks}/`, `server/lib/card-statistics/` | endpoints, precomputation                     |
| `server/db/schema/{tournament*,card_stat*,meta,deck*,daily_snapshot}.ts`                              | data model                                    |
| `.ai/planning/feature-{live-tournaments*,matchup-filters,matchup-dialog}/`                            | the author's design intent                    |
| `https://swubase.com/meta`, `/tournaments/<PQ id>`                                                    | live confirmation of the meta and event pages |
| `docs/spec/tournaments.md`, `src/routes/prototype/tournaments/NOTES.md`, `CONTEXT.md`                 | the Novastack side                            |
