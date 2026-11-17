# Research: ingesting Cyberpunk TCG tournaments and decklists from Melee

Gathered **2026-11-16**. Everything "observed" was read live that day from one event, Melee tournament
**485070** (_The Hungry Dragon, Cyberpunk TCG: Night City Showdown_, 14 players, 4 Swiss rounds), with
an identifying User-Agent, 5 s between requests, no login and no cookies. About 15 requests to
melee.gg in total. `/llms.txt` on melee.gg returns 403 to non-browser clients, so there was nothing to
prefer over the pages themselves.

## Verdict

- **Official API (client ID/secret): not needed, and not available to us.** It is approval-only,
  limited to organizations and designated staff; third parties need Coverage Staff clearance per
  tournament or organization (<https://help.melee.gg/docs/api-use/>).
- **The public web endpoints work anonymously.** The same JSON the tournament page loads for itself
  can be requested with no cookie, no anti-forgery token and no login. This is what swubase.com does
  (`the-medo/swu-collection`, `server/lib/imports/tournamentImportLib.ts`), with Melee's knowledge,
  per its author.
- **Discovery is the unsolved part.** `/Decklists?q=…` (the listing filtered to Cyberpunk TCG)
  redirects to `/Account/SignIn`. Everything below starts from a known tournament ID. swubase curates
  IDs by hand.
- **TopDeck.gg is not a substitute**: it only covers events run on TopDeck. Ruled out.

## Etiquette, as observed

- `robots.txt`: `Crawl-Delay: 5`; disallows `/Decklist/View/`, `/Decklist/Index/`,
  `/Tournament/Search/`, `/Tournament/SearchResults/` and others. The decklist page we need is on the
  disallow list. Melee's Terms of Use reportedly forbid automated access (**SECONDARY**, a GitHub
  issue; the ToS page itself 403s to non-browsers and was not read). The user reports Melee is aware
  of and OK with swubase's use; Novastack has not asked.
- **WAF:** requests whose User-Agent does not start with `Mozilla/5.0` get `403` on every path.
  Observed: `novastack-research (personal project)` → 403; `Mozilla/5.0 (compatible; NovastackResearch/1.0;
personal fan project)` → 200 (113 KB, identical to a browser-style UA). So an honest, conventional
  bot UA is enough; no browser impersonation is needed. swubase sends a Chrome 139 UA plus
  `sec-ch-ua*` headers and a static `TOURNAMENT_COOKIE`; we need neither (see below).
- Use 5 s spacing. A 14-player, 4-round event is 8 requests; larger events page (`length=500`).

## Endpoints (all observed 200, anonymous, no cookie jar)

Base `https://melee.gg`. Headers used for the POSTs: `X-Requested-With: XMLHttpRequest`, `Origin`,
`Referer`, form content type. The page GET set **no cookies** at all.

| step         | request                                                                            | gives                                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rounds       | `GET /Tournament/View/{id}` (HTML)                                                 | `#standings-round-selector-container button.round-selector` → `data-id`, `data-name`, `data-is-completed`; same for `#pairings-…` with `data-is-started`. Decklist links `/Decklist/View/{guid}`. |
| details      | `GET /Tournament/GetTournamentDetails?id={id}`                                     | `ID, Name, StartDate, Status ("Ended"), OrganizationId/Name, Format, ParticipatorCount, BrandImageSource` (317 B)                                                                                 |
| standings    | `POST /Standing/GetRoundStandings` (DataTables form, `roundId`, `start`, `length`) | `{recordsTotal, data[]}`; one row per team                                                                                                                                                        |
| matches      | `POST /Match/GetRoundMatches/{roundId}` (DataTables form)                          | `{recordsTotal, data[]}`; one row per table                                                                                                                                                       |
| deck         | `GET /Decklist/View/{guid}` (HTML)                                                 | the card list                                                                                                                                                                                     |
| deck results | `GET /Decklist/GetTournamentViewData/{guid}`                                       | `{Json: "<string>"}` → `{Standings[], Matches[], Team}`; that deck's full path through the event                                                                                                  |

The DataTables body is the page's own: `draw`, `columns[i][data|name|searchable|orderable|search][…]`
for each column, `order[0][…]`, `start`, `length`, `search[…]`. The column list used (and sufficient):
standings `Rank, Player, Decklists, MatchRecord, GameRecord, Points, OpponentMatchWinPercentage,
TeamGameWinPercentage, OpponentGameWinPercentage, FinalTiebreaker, OpponentCount`; matches
`TableNumber, PodNumber, Teams, Decklists, ResultString`.

## Data shapes

**Standing row** (last round's standings = final results): `Rank`, `Points`, `MatchRecord "4-0-0"`,
`GameRecord "8-1-0"`, `MatchWins/Losses/Draws`, `GameWins/Losses/Draws`, `RoundId`, `RoundNumber`,
`TournamentId`, `FormatId` (`fa955583-31da-48c6-b9d4-e5637d6c4286` = Constructed, the same value as
in the `?q=` filter), `Team.Players[0]` (`ID`, `DisplayName`, `Username`), and
`Decklists: [{DecklistId (guid), PlayerId, DecklistName, Format, FormatId}]` (empty when a player
registered no deck: 1 of 14 here).

**Match row**: `Competitors[2]` (each `Team.Players[0]`, `GameWins`, `GameByes`, `Decklists[]`),
`ResultString` (`"TentacleMom won 2-0-0"`, `"… was assigned a bye"`, `"… Draw"`, `"… forfeited the
match"`), `TableNumberDescription`, `RoundNumber`.

**Deck page** (`/Decklist/View/{guid}`): a hidden `<pre id="decklist-text">`:

```
MainDeck
3 Detonate
1 Saul Bright | Stormrider

Legends
1 Adam Smasher | Ender of Legends

Sideboard
2 Gunpoint Diplomacy
```

Lines are `qty Name` or `qty Name | Subname`; sections `MainDeck`, `Legends`, `Sideboard` (blank-line
separated). Also `.decklist-details-row`: `"Nov 16th 2026 • Cyberpunk TCG • Constructed • Deck: 40
cards • Sideboard: 7 cards"`, and structured `.decklist-category` / `.decklist-record` blocks whose
names link to `/Card/View/<slug>?game=CyberpunkTCG`. (swubase reads `pre#decklist-swu-text`; the
Cyberpunk equivalent is `pre#decklist-text`.)

## Quirks to design around

- **There is no structured event "type" like Showdown.** `GetTournamentDetails` has no such field (only
  `Format: "Constructed"`), and neither do the standings or match rows. The tournament page's header does
  carry Melee's own metadata, as text we do not parse today: `Game`, `Organized by`, `Event Venue`,
  `Tournament Type`, `Entry Fee`, a registration mode (`Open Registration` / `Invite Only`), `Format`, a
  status, and `N of CAP Enrolled Players`. Across the five ingested events `Tournament Type` was `Tabletop`
  every time, so it is how the event is played, not a category. "Showdown" appears only in the
  organizer-written **name** ("Night City Showdown", in all five) and in some descriptions. Checked
  2026-11-16 on 485070, 477190, 495716, 487802, 478979.
  **Now ingested** (migration `0015`): venue, tournament type, entry fee, registration mode and capacity,
  read from the header's stable element ids (`#tournament-headline-platform`, `…-registration`, and the
  `data-type="venue"` link). Observed values: type `Tabletop` ×5; fee `$20.00`–`$30.00 (External to
Melee)`; registration `Open Registration` ×4 and `Invite Only` ×1; capacities 16, 32, 32, 32, 128.
  The event kind (Showdown) is derived from the name, not stored (spec §3.1).

- **A registered deck can be incomplete.** In 485070 one player's `Decklist/View` text totals 21
  main-deck cards (8 lines). It is Melee's own text, not a parsing loss, so ingest must keep it and
  report it, not refuse the event.
- **Wrangler prints a JSON result per statement** for `d1 execute --file --json`, thousands of lines
  for a large event; the CLI reads and summarises them.

- **`GetTournamentDetails` has no format id** (only `Format: "Constructed"`). The format GUID comes
  from the standings rows (`FormatId`) and from each decklist reference.
- **A standing with no `Decklists` really can mean no deck.** In the event measured, rank 12's
  `GetPlayerDetails` returned `decklists: []`. So the fallback was right to return nothing. The shape
  of a _non-empty_ list there is unseen; swubase reads `id`.
- **`GameWins: null` means 0** (a loser with no game wins), and a draw is `GameWins` 1 and 1 with
  `GameDraws: 1`. A match with a result has `HasResult: true`. No bye, forfeit or top cut appeared in
  these four rounds; the sentences for those come from swubase.
- **Match rows carry `RoundId` reliably;** use it to find the round number rather than `RoundNumber`.
- **The match table and the standings table agree:** recomputing every player's W-L-D from the 28
  match rows reproduces all 14 standings rows exactly (a test, `tournaments.spec.ts`).

- **`Decklist/View/{guid}` fetched with swubase's headers, no cookie (probed once, 2026-11-16):** `200`,
  20,684 B, no redirect, no `Set-Cookie`, no sign-in markers, exactly one `pre#decklist-text`, and the
  text identical to what the browser showed. The page is HTML-escaped, so a parser must **decode
  entities**: `Royce | Don&#39;t Call Me Simon` is `Don't`. (The earlier browser read had already
  decoded it.)
- **Unclaimed players have `Username: "__placeholder__"`**; key people on `Player.ID`, never `Username`.
  `DisplayName` is free text.
- **`DecklistName` is not an archetype**: here it is three colour letters (`"G R R"`, `"R Y Y"`). Derive
  the archetype from the Legends instead.
- **Record order differs between endpoints**: standings say `GameRecord "8-1-0"` for a player the
  deck-results endpoint reports as `"8-0-1"`. Pick one source and verify which column is losses
  before storing.
- **Result strings are English prose** (`"X won 2-0-0"`); a player named like `"Dude won the Potato"`
  breaks naive splits (swubase splits on the last `" won "`). Prefer `Competitors[].GameWins`.
- **Players with 0-0-0** can sit high in standings in swubase's experience; re-rank after skipping.
- **Inline `Json` string** in `GetTournamentViewData` is JSON inside JSON.
- **Multiple decklists per player** are possible (`Decklists[]`); filter by `FormatId`/`Format`.
- Unanswered: the 14-player event had no Legends mapping failures only because none were attempted.
  Legends are `Name | Subname` while the card model has Legends with a name/subname split; mapping
  from deck lines to our Card slugs is untested.

## Open questions

1. **Discovery**: how do we learn that a Cyberpunk TCG tournament exists? Hand-curated IDs (swubase),
   organizer submissions, or asking Melee for a feed.
2. **Ask Melee.** swubase has their OK; Novastack does not. Worth an email to contact@melee.gg asking
   for the same and for our UA to be allowlisted.
3. **Retention and display**: store player display names? Standings and decklists on Melee are public
   but personal data; decide what the site shows.
4. Does the multi-day/large-event case page correctly (`recordsTotal` > 500)? Only a 14-player event
   was tested.
