# Research: how swubase.com's tournament bracket works, and what Novastack can adopt

Gathered **2026-11-18**. Deep-dive companion to the "Details & Bracket" section of `swubase-surfaces.md` and to
`swubase-deck-view.md`. Sources: the shallow clone at `/tmp/swu-repo/src` (frontend paths below are relative to
`frontend/src/components/app/tournaments/` unless they start with `/`) and the live site. Tags: **[src]** read in
the source, **[live]** seen on swubase.com, **[inferred]** my reading, **UNVERIFIED** not reached. `/llms.txt`
was already established as absent (SPA shell). swubase is AGPL-3.0; this note describes behaviour in my own
words and copies no code or assets.

Live pages used (1440 and 390 wide, no login, no form submission): PQ Seattle (63 players, top 8), SWU Open #2
Malmo (90 players, **top 16**, the larger of only two top-16 events among about 1,290), PQ Henderson (11 players,
top 4), Regional Open Utrecht (125, no cut), PQ Medellin (not imported). Counts of `bracketInfo` across all
events [live, `/api/tournament`]: top8 about 1,220, top4 31, none 37, top16 2. There is no top 32 option.

## 1. Inventory

### 1.1 Where it sits

- It is the first panel of the **Details & Bracket** tab (`DetailAndBracketTab.tsx`): one bordered section labelled
  "Tournament results", above Overview / photos / reports for imported events; below them for un-imported ones.
  **[src]** `TournamentTabs/DetailAndBracketTab.tsx`. One component, `TournamentTopBracket/TournamentTopBracket.tsx`,
  owns the panel and all interaction state.
- The same panel is used for every event; its cut size comes from one per-tournament setting, `bracket_info`
  (`none`, `top4`, `top8`, `top16`), set by an admin in the tournament form (`TournamentForm.tsx`,
  `components/BracketInfoSelect.tsx`). It is **not inferred from the matches**. **[src]**
- The tab URL has no bracket state: no hover, selected player or open deck is in the URL; reload returns to the
  bracket. **[live]** (URL unchanged after opening a deck.)

### 1.2 Around the bracket

- **Header row:** a trophy icon, "TOURNAMENT RESULTS", a small "TOP 8" size chip (hidden when there is no cut),
  and on the right a **Champion chip** ("Champion" + player name, truncating, tinted). The chip is only shown
  when there is a cut and a placement-1 deck. **[live]** + **[src]** `TournamentTopBracket.tsx`.
- **Final standings rail** (left, 276px, only at container width of 900px or more): header "Final standings" and a
  "8 players" count chip. Players are grouped by finish with a small caps heading and a rule: **Champion**
  (trophy icon, primary tint), **Finalist** (medal icon), **Top 4**, **Top 8**, **Top 16** (placements 3-4,
  5-8, 9-16). Each row is a tile: Leader+Base art, player name, and a separate "open deck in new tab" arrow link.
  Champion row has a primary-tinted fill, finalist a card fill, the rest a faint one. **[src]**
  `components/TournamentPlacements.tsx`; **[live]** all three events.
- The rail lists **only placements inside the cut** (placement 1..N from `tournament_deck`), ordered by
  placement; the Swiss field outside it is not shown here. **[src]** `topDecks` filter in `TournamentTopBracket.tsx`.
- **No-cut events** (`none`): rail shows the first 8 placements under no group headings (the aria label says
  "Place N"; no visible number), and the bracket area is replaced by an "Explore the field" panel with four
  links (Meta breakdown, Explore the decks, Matchups, Card statistics). **[live]** Utrecht; **[src]**
  `components/TournamentNoBracket.tsx`.
- **Players with no deck** render a tile without art and a disabled button (`aria-label` "..., Deck unavailable"),
  no new-tab link. **[live]** Utrecht (two of eight); **[src]** `TournamentPlacements.tsx`.
- **Hint line above the tree:** "Scroll to explore rounds" with a move-horizontal icon, plus " - Select a player
  to view their deck" only if any bracket player has a deck. **[src]** `components/BracketRounds.tsx`.
- No filters, toggles or view modes on the bracket. The only "mode" is the in-place deck viewer (1.4).

### 1.3 The tree

- **Columns = rounds**, left to right, headed by a bold name and a mono two-digit index ("01", "02", "03") at the
  right edge; the last column's name carries a trophy icon. Names come from **position from the end**, not from
  Melee: Final, Semifinals, Quarterfinals, Round of 16, else "Round N". **[src]** `bracketModel.ts` `roundName`.
- **Fixed geometry:** columns 250px wide, 24px gap, base row 176px doubling each round, 36px header; the whole
  tree is a fixed pixel width centred inside a bordered, tinted, horizontally scrolling container (tabindex 0,
  `role=region`, aria-label "Elimination bracket, scroll horizontally for later rounds"). **[src]**
  `BracketRounds.tsx`. Height grows with the first round; top 16 is about 1,470px tall and 1,096px wide, so the
  page scrolls vertically and the pane horizontally. **[live]** Malmo.
- **Connectors:** one absolutely positioned SVG behind the cards, `pointer-events: none`, `aria-hidden`. For
  every match in every round but the last, one elbow path (horizontal, vertical, horizontal) runs from the
  match's right edge to the left edge of **the next-round match that contains that match's winner**. Default
  stroke 1.5px muted border colour. **No connector is drawn for a match with no winner**, and none for the
  final. **[src]** `BracketRounds.tsx`; **[live]** six paths in Seattle (4 + 2).
- **Match card** = two stacked player buttons separated by a hairline, in a rounded bordered card. Nothing else:
  no seed, record, table number, deck name, date or round label on the card. A draw count line ("1 drawn game")
  appears under the card only if `game_draw > 0`. **[src]** `components/BracketMatchCard.tsx`.
- **Player row (64px min height):** Leader+Base art in miniature (Leader portrait with the Base as a small
  circular badge), player name (truncated, `title` has the full name), then a **score chip** with game wins.
  **Winner:** name goes bold and full-contrast, a check mark appears, row gets a faint primary fill, and the
  chip turns solid primary/green. **Loser:** muted name, grey chip, no fill. There is **no dimming** of the whole
  card. **[src]** `components/BracketPlayer.tsx`; **[live]**.
- **Missing pieces:** an empty round column shows "Round data unavailable"; a player with no deck simply loses
  the art (the row still shows); an unknown opponent name renders "Unknown player". No "TBD" slot in the
  completed bracket. **[src]**
- **Byes** are dropped from the bracket (`is_bye`). **Third-place match:** no code path; any such match shares
  the final's round number, is not linked to a prior match, and would be appended after the final in the same
  column (**[inferred]**, not seen on any event; no top-3/4 playoff test exists). **No losers bracket**; it is
  single elimination only.

### 1.4 Interactions

- **Hover (or keyboard focus) a player row, in the tree or in the rail:** that player's username goes into one
  shared state, and every place they appear lights up at once. **[src]** `TournamentTopBracket.tsx`
  (`highlightedPlayer`); `BracketPlayer.tsx` and `TournamentPlacements.tsx` set it on mouse enter/leave and
  focus/blur.
  - **Path highlight, exactly:** a connector is drawn thicker (2px) and in the primary colour **only when its
    source match was won by the highlighted player**. So hovering the champion lights QF to SF to Final;
    hovering a loser lights nothing along the lines. Verified: the champion hover changed exactly two of six
    paths, stroke width 1.5 to 2 and colour from near-black to the primary green. **[live]** Seattle.
  - **What else changes:** each of that player's rows in the tree gets a stronger primary fill (15%), and their
    tile in the rail gets a primary border and fill. **Nothing else dims**: other cards and lines are untouched.
    **[src]** + **[live]** (screenshot). Cross-highlight works from the rail to the tree and back.
- **Click a player row (or rail tile) with a deck:** the whole tree area is **replaced in place** by the deck
  viewer: a "Back to tournament results" button, then the full deck view (the same component as a standalone
  deck, with its toolbar, card art, layout and grouping controls). The rail stays and keeps that player's tile
  highlighted. Highlight is cleared on open. **[src]** `TournamentTopBracket.tsx`, `components/DeckViewer.tsx`;
  **[live]** Seattle.
- **The deck viewer includes the player's path:** a compact table headed "Player: Ya2Sabes #1 (7-0-2)" with one
  row per match in order (Swiss then playoff): score, opponent name, opponent's Leader/Base label; rows are
  green/red by result. **Clicking a row swaps the viewer to that opponent's deck** (so you can walk the
  bracket by opponents). Back always returns to the bracket. **[src]** `decks/DeckContents/DeckMatches/DeckMatches.tsx`;
  **[live]** nine rows for the champion. The table has no round names and no playoff markers (the last three
  rows are the playoff).
- **Focus management:** opening a deck focuses "Back"; closing it returns focus to the exact trigger that opened
  it; the content keeps its previous minimum height while the viewer is open so the page does not jump up.
  **[src]** `TournamentTopBracket.tsx`.
- **Touch:** there is no hover, and tap is a click, which opens the deck and clears the highlight, so the path
  highlight never shows on a phone. **[inferred]** from source; not tested on a real touch device.
- **No match popup or dialog** exists for a bracket match; scores are on the card, nothing opens for the match
  itself. The separate "Matchups" tab has a matchup dialog with a round label column ("Round N" for Swiss,
  Quarterfinals/Semifinals/Finals for the cut, derived from `bracketInfo` and the highest round number) but
  that is a deck-pair table, not the bracket. **[src]** `TournamentMatchups/components/MatchupDialog/matchupRound.ts`.
- **Keyboard / a11y:** every player is a real `<button>` with a full label ("Name, 2 game wins, match winner.
  View deck"); focus outline is visible and inset; the scroll container is focusable and labelled; the rail is
  an ordered list inside labelled groups (`aria-labelledby` the finish heading); the winner check carries an
  "Winner" label; loading is `role=status` with sr-only text, errors `role=alert` with a Try again button.
  There is no arrow-key navigation between matches. **[src]**

### 1.5 States

- **Loading:** skeleton (heading bar plus a tall block), sr-only "Loading tournament results...". **[src]**
- **Error:** decks failed gives "Unable to load tournament standings" + retry; matches failed shows the
  standings rail and an inline "Unable to load match results" + retry in place of the tree. **[src]**
- **No standings and no bracket:** "Final standings are not available yet." **[live]** (Medellin, un-imported, also
  says "Not imported yet" in the Overview.) **No bracket but standings:** "Match results are not available. You
  can still explore the final standings." **[src]**
- **Incomplete or in-progress events:** the details-tab bracket only exists for imported (finished) events.
  In-progress is a different component: the home "Live" cards open a **"Top 8 bracket" dialog** that always draws
  the 4/2/1 shape, with dashed "TBD" slots for undecided players, loser rows at half opacity, an **amber**
  highlight (same hover model) and a standings column that groups by progress ("Top 2", "3rd-4th", "5th-8th")
  until the final is played, then Champion/Finalist. **[src]** `/components/app/home/live-tournaments/components/BracketPreview.tsx`
  and `bracket-preview/*`; **UNVERIFIED live** (no live tournament on the site while I looked).
- **Mobile (390px) [live]:** the rail collapses to a "Final standings (8)" accordion row above the tree,
  closed by default (`aria-expanded`); the tree is the same fixed-width tree in a horizontal scroller (822px of
  content in a 324px window), with the hint text above. Header chip wraps. No snap, no per-round paging.
- **Image export:** the panel is a screenshot target (`data-screenshot-target`), captured after import for
  Discord and social posts (the screenshotter expands the accordion and widens the viewport to fit the whole
  tree). **[src]** `/server/screenshotter/targets/tournament/bracket.ts`.

### 1.6 How the structure is derived

- **Inputs:** `tournament.bracket_info`; all `tournament_match` rows for the event (`round` integer, `p1_username`,
  `p2_username` nullable for a bye, `game_win`, `game_lose`, `game_draw`, `result` 0/1/3 from p1's view,
  `bye` boolean, optional deck ids); all `tournament_deck` rows (`melee_player_username`, `placement`) joined to
  decks. Players are **keyed by Melee username**. **[src]** `/server/db/schema/tournament_match.ts`, `buildBracket.ts`.
- **Algorithm:** (1) no matches or `none` gives no bracket. (2) Take the distinct round numbers, descending.
  (3) Required rounds = log2(N) from the setting (top 8 gives 3). (4) For round index 0 (final), 1, 2...: candidates
  are that round's non-bye matches. (5) Order them by advancement: for each match in the _next_ round, put the
  candidate that its player 1 won, then the one its player 2 won; append unmatched candidates. (6) Winner = p1
  if `result` is 3, p2 if `result` is 0 (limited formats: a 0-0 double forfeit has no winner), none on a draw.
  (7) Reverse so the first round is first. Each entry carries both decks (or null), winner username, game wins,
  losses, draws. **[src]** `TournamentTopBracket/buildBracket.ts`; tests in `buildBracket.test.ts` and
  `bracketModel.test.ts` cover shuffled input, player-two winners, missing decks, byes dropped, absent rounds
  left empty, forfeits, and no cut.
- **Edge cases handled:** matches arrive in any order; a winner can be p1 or p2; decks absent for either side;
  rounds beyond the data stay as empty columns; byes ignored; double forfeits. **Not handled / assumed:**
  the playoff must be the highest round numbers; N must be right (a wrong `bracket_info` mislabels rounds);
  username changes break the player-to-deck link; byes in the cut and third-place matches have no layout.
- **Data summary:** per match: round order, both players, both game counts (draws), a result or winner, bye flag;
  per player: placement (for the rail), deck link, Leader+Base art. Seed, record and table are **not used**.

## 2. What it does well (ranked)

1. **One shared "who" highlight across rail and tree.** Hovering a person lights them everywhere; the winner's
   path glows. A reader answers "how did this person get here" without clicking. Cheap, and it makes a static
   diagram feel alive.
2. **Placements rail grouped by finish (Champion / Finalist / Top 4 / Top 8).** Gives the result at a glance and
   a deck door for every top-N player, including those the bracket draws far apart. It also keeps working when
   the match data is missing.
3. **Deck opens in place, with Back, and the rail stays.** No navigation, no lost scroll position; focus returns
   to where you were. Walking from a bracket row to a decklist is one click.
4. **The deck's own path through the event (opponent, score, their Leader), each row a door to that deck.**
   Turns the deck view into a way to walk the bracket by opponents.
5. **Clean match card:** art, name, score chip, winner bold + check + tinted chip. Easy to scan; no clutter.
6. **Honest degradation:** per-section errors with retry, "Round data unavailable", disabled-not-hidden deck
   buttons, an "Explore" panel when there is no cut, a standings accordion on mobile.
7. **Real buttons and labels** (sr-only winner, aria on each row, focusable scroller) so it is operable
   without a mouse, even though the highlight itself is hover/focus only.
8. Whole-panel screenshot target: the bracket doubles as a shareable image.

Weaknesses worth not copying: highlight only follows wins (a loser's elimination is unmarked); no touch
equivalent of the highlight; no seeds, records or tables; no third-place or byes in the cut; the deck's path
table has no round names; state is not in the URL; round names are guessed by position.

## 3. Compared with Novastack's bracket

Novastack today (`src/lib/tournaments/bracket.ts`, `src/routes/tournaments/[id]/podium/+page.svelte`): playoff
rounds are those Melee does not name "Round N", **named from Melee** (so Quarterfinals/Semifinals/Finals as
given). Matches ordered by advancement from the final back (same idea as swubase), byes dropped. Cards show both
players' Legends in miniature (overlapped), name, games; the winner has a neon left rule, tint and bold; the
loser is muted. Whole row is a link to `/tournaments/decks/{guid}` when registered, else a plain row titled "No
deck registered". CSS-border connectors (no SVG) only when each round halves (`joined`). A champion banner above
(big art, name, Legends, "Open the deck"). A draw or unfinished match has no winner. Without a playoff the page is
a podium (top 3, 4th-8th tiles, field chips). Standings carry rank/record/deck; matches carry table, games, draws,
kind.

| swubase feature                                                                                     | Novastack                                                                                                      | Size                               | Data needed                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path highlight** (shared hovered/focused player, winner-path lines thicker + accent, rows tinted) | **Missing**                                                                                                    | **Small** to **medium**            | `playerId` already on both sides and on `BracketMatch`. Needs a connector per match that knows its winner and next match; today connectors are static spans, so either per-match winner flags on the existing spans or a small SVG overlay. No new data. |
| Placements rail (Champion / Finalist / Top 4 / Top 8 groups, deck links, count chip)                | **Partly** (champion banner; podium page lists ranks only when no bracket)                                     | **Small-medium**                   | `standings` rank + `deck.legends` + guid; finish label by rank (1, 2, 3-4, 5-8, 9-16). Players without a registered deck get a plain tile. Melee rank is available for everyone, deck only for some.                                                     |
| Cross-highlight rail and tree                                                                       | **Missing**                                                                                                    | **Small** (once the rail exists)   | `playerId`                                                                                                                                                                                                                                               |
| Header chip "Top N" and champion chip                                                               | **Partly** (large banner exists; no size chip)                                                                 | **Small**                          | cut size from `rounds[0].matches.length * 2`                                                                                                                                                                                                             |
| Round columns, names, trophy on the final, index                                                    | **Have** (names from Melee; no index/trophy)                                                                   | **Small**                          | none                                                                                                                                                                                                                                                     |
| Round of 16 / extra rounds                                                                          | **Have** (draws any number of Melee playoff rounds)                                                            | none                               | wider tree scrolls; check header names for non-"Round N"                                                                                                                                                                                                 |
| Match card: Legends art + name + games + winner styling                                             | **Have** (swubase adds a check mark, score chip and base badge; Novastack shows both Legends, which is richer) | **Small** polish                   | none; a check or score chip is optional                                                                                                                                                                                                                  |
| Draw count under card                                                                               | **Partly** (draws not shown)                                                                                   | **Small**                          | `MatchView.draws` already present                                                                                                                                                                                                                        |
| Connectors                                                                                          | **Have** (static, when halving)                                                                                | none                               |                                                                                                                                                                                                                                                          |
| Connector only from won matches, drawn per winner                                                   | **Missing**                                                                                                    | **Small** (part of path highlight) | winner flag already built                                                                                                                                                                                                                                |
| Deck opens in place, Back, focus return                                                             | **Missing** (navigates to the deck page)                                                                       | **Medium-large**                   | full deck for each player (decklists are already in `EventView`); needs the deck component embedded, a Back control and focus handling. Not needed if navigation is acceptable.                                                                          |
| Deck's path through the event (opponent, score, their Legends, clickable)                           | **Missing**                                                                                                    | **Medium**                         | all `matches` for that player plus opponents' `legends`; both exist. Round names for Swiss vs playoff come from `rounds`.                                                                                                                                |
| Missing-deck handling (disabled, not hidden)                                                        | **Have** (plain row + title)                                                                                   | none                               |                                                                                                                                                                                                                                                          |
| Empty / error / loading panels                                                                      | **N/A** (server-rendered; podium is the no-playoff fallback, nicer than swubase's "Explore" panel)             | none                               |                                                                                                                                                                                                                                                          |
| "Round data unavailable" padding for missing rounds                                                 | **Missing**; Novastack just omits empty rounds and sets `joined` false                                         | **Small**                          | rounds are named in Melee, so a missing earlier round is rare; skip unless an event demands it                                                                                                                                                           |
| Mobile: collapsed standings accordion, scroll hint                                                  | **Partly** (`overflow-x-auto`, no hint)                                                                        | **Small**                          | none                                                                                                                                                                                                                                                     |
| In-progress / TBD slots and loser dimming (live dialog)                                             | **Missing**                                                                                                    | **Medium**                         | pending match slots; Novastack's data is final-only, so low value now                                                                                                                                                                                    |
| Third place / byes in the cut / losers bracket                                                      | **Partly** (third place is appended after the rest, unlinked; byes dropped)                                    | **Small** to label                 | would need a Melee round name like "3rd place" check                                                                                                                                                                                                     |
| Highlight in URL, keyboard arrows between matches                                                   | **Missing in both**                                                                                            | **Medium**                         | optional                                                                                                                                                                                                                                                 |
| Seed, record, table on the card                                                                     | **Missing in both**; Novastack has them in data                                                                | **Small**                          | `StandingView` rank/record, `MatchView.table`                                                                                                                                                                                                            |
| Screenshot/Image export of the bracket                                                              | **Missing**                                                                                                    | **Large**                          | would need a headless render; the deck image work in `deck-image-overhaul.md` is the closer path                                                                                                                                                         |

## 4. Recommended order

1. **Path highlight with a shared hovered/focused player** (the user's ask). Svelte `$state` for the highlighted
   `playerId`, set on `mouseenter`/`focus`, cleared on leave/blur; accent only the connectors whose winner is
   that player and tint that player's rows. Add a touch fallback (tap and hold, or a small "Follow" button on the
   row) because hover does not exist on a phone, which swubase does not solve. Small.
2. **Placements rail** grouped Champion / Finalist / Top 4 / Top 8 (/ Top 16), each tile with Legends art, name,
   record and a deck link, wired to the same highlight state. Collapses to an accordion on mobile. This also fills
   the page when the playoff is only Semifinals and Finals (4 players). Small-medium.
3. **Match-card polish:** check mark and score chip for the winner, draws line, a "Top N" size chip and a
   trophy on the final column header. Small.
4. **The deck's path through the event** (opponents, scores, their Legends, each a link) on the deck page, with
   playoff rounds labelled by their Melee names. Medium; reuses `matches` and `standings`.
5. **Deck in place with Back** only if navigating to the deck page feels like a loss of context after 1 and 2.
   Medium-large; defer.
6. Round-order and label edge cases (third place, missing early rounds) when a real event needs them; live /
   TBD slots only if Novastack ever ingests in-progress events.

## 5. Not verified

- Keyboard behaviour and focus return are read from source only; no real key presses or touch device in the
  browser.
- Hover on a **loser** was not re-captured live; the "no lines light" claim comes from the source rule plus the
  winner-hover measurement.
- The home "Live" top 8 dialog was not opened (no live event); described from source.
- Third-place and in-cut bye behaviour is inferred; no event with either was found.
- Whether a top-16 or top-4 event's connectors differ from top 8: top 16 renders four columns and the same
  rules; not measured line by line.
