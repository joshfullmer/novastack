# Research: how swubase.com's deck view works, and what Novastack can borrow

Gathered **2026-11-17**. Sibling of `swubase-surfaces.md` (tournament and meta pages); this note covers only the
single-deck view. Sources: the shallow clone at `/tmp/swu-repo/src` (paths below are relative to
`frontend/src/components/app/decks/` unless they start with `/`) and the live site. Tags: **[src]** read in the
source, **[live]** seen on swubase.com, **[inferred]** my reading, **UNVERIFIED** not reached. `/llms.txt` was
checked first and returns the SPA shell (no llms.txt). Study only: no swubase code or assets are copied here.
swubase is AGPL-3.0, so everything below is behaviour described in my own words.

Live pages used: a public user deck (`/decks/24f22fd9-...`, 51 main / 0 side, desktop 1440 and mobile 390) and
the All Decks tab of a PQ event (`/tournaments/e3e2220d-.../decks?maDeckId=...`). No login, no form submission.

> **Status (2026-11-17):** recommendations 1 and 2 are built (the tournament deck uses the saved-deck
> components; path rows open the opponent's deck). Recommendation 3 (export, "open as a new deck") is not.

## 1. The deck view, element by element

### 1.1 One component, three placements

- **One component renders every deck.** `DeckContents/DeckContents.tsx` is the deck view; the full page
  (`DeckDetail/DeckDetail.tsx`, route `routes/decks/$deckId/index.tsx`), the tournament side pane
  (`tournaments/TournamentDecks/TournamentDeckDetail.tsx`), the bracket and matchup viewers
  (`TournamentTopBracket/components/DeckViewer.tsx`, `TournamentMatchups/.../MatchupDeckViewer.tsx`), a modal
  (`DeckPreviewDialog.tsx`) and the comparer all mount it. A `compact` prop swaps the toolbar for a smaller one.
  **[src]** This is the main reason the view feels consistent everywhere.
- **Tournament decks are ordinary decks**, so every feature (export, compare, image, price) works on them
  unchanged **[src]** (also noted in `swubase-surfaces.md` section 6).
- **Opened from a list as a pane, not a page.** The All Decks table sits left and the deck opens in a scrolling
  pane to its right (`#tournament-deck-detail`, fixed to viewport height minus 200px on `lg`), with an X to
  close and the placeholder "Select a deck to view details" when empty. The selected deck lives in the URL
  (`?maDeckId=`), so it is linkable and survives reload. **[src]** `TournamentDeckDetail.tsx`; **[live]** clicking a
  row only changed the query string.
- **Loading and errors.** The embedded variant shows a plain "Loading decklist..." status while the deck and
  cards resolve, and "This deck is unavailable" with a Try again button on error; a 404 page says the deck was
  deleted or is not public. **[src]** `DeckDetail.tsx`, `DeckPreviewDialog.tsx`. The page title reads "Loading deck"
  then the deck name **[live]**.

### 1.2 Layout and what is above the fold (full page, desktop) [live]

- **Title row:** deck name, "deck by" + owner avatar and name, free-text description below.
- **Action bar:** star (favourite), Copy link, Add to comparer, Duplicate, Prices selector, Export dropdown, a
  settings gear. The bar is **tinted with a gradient of the deck's aspect colours** (green here, blending to
  blue), which gives each deck an identity at a glance. **[src]** `DeckNavigationMenu.tsx` (`useDeckColors`).
- **Two columns below** (container query at 700px, not a viewport breakpoint **[src]** `DeckContents.tsx`):
  - **Left, 350px sticky-ish column:** Leader card art (large, with a flip button), Base art, the deck price badges
    ("42.90 EUR", "$86.11"), and for a tournament deck the "path through the event" table (1.8). Optional
    "Deckbuilder" and "Guide" buttons for the owner.
  - **Right, fluid:** a tab strip `Decklist | Charts | comment count`, an `Image` button, a `Layout:` dropdown and
    a `Group by:` dropdown; then "51 maindeck / 0 sideboard"; then the list.
- **Above the fold:** both Leader and Base art, price, the toggles and the first 12-13 rows of the first group.
  The whole deck (36 + 8 + 7 cards plus sideboard) is reachable by scrolling one column pair. **[live]**
- **Mobile (390px) [live]:** the toolbar wraps to three rows, then the Leader and Base art stack at near full
  width. The decklist begins well below the first screen, so the art costs a screen of scroll before the list.
  A bottom tab bar (Home, Meta, Decks, Cards, More) replaces the sidebar. This is the weakest part of the view.
  Hover previews are disabled on mobile (`useSidebar().isMobile`, **[src]** `DeckCards/DeckLayout/DeckCardHoverImage.tsx`).
- **Side pane variant [live]:** same view, narrower; the left column collapses into a row above the list because
  the container is under 700px. A fifth of the pane is chrome before the first card.

### 1.3 Grouping and ordering

- **Seven group-bys** in a `Group by:` dropdown: Card Type (default), Cost, Aspect, Aspect (detailed), Trait,
  Keywords, Set. **[src]** `DeckCards/deckCardsLib.ts`, `DeckCards/lib/groupCardsBy*.ts`; default from
  `/tmp/swu-repo/src/shared/lib/userSettings.ts` (`deckGroupBy`).
- **Order inside any group is cost ascending**, applied once before grouping; the cost group appends a "No Cost"
  bucket last. **[src]** `deckCardsLib.ts`, `lib/groupCardsByCost.ts`.
- **Each group header carries its copy count** ("Unit - Ground (36)", "Event (7)"), the sum of quantities, not
  the number of rows. **[src]** `DeckLayoutText.tsx`; **[live]**.
- **Grouping applies to the main deck only**; sideboard and maybeboard are fixed separate blocks after it. **[src]**
- **Leader and Base are not in the list at all:** they live in the left column as art. **[live]**

### 1.4 How copies are shown (eight layouts)

Eight layouts in a `Layout:` dropdown: Text, Text condensed, Grid, Grid - Small, Grid - Overlap, Stacks,
Stacks - Split, With wording. The choice is a stored user setting (`deckLayout`, default Text). **[src]**
`DeckLayout/DeckLayout.tsx`, `DeckActionsMenu/components/DeckLayoutMenu.tsx`.

- **Text:** one row per card: copy count at the left ("3"), name (truncated), then cost icon and aspect icons at
  the right, then a small chevron menu. Rows are separated by hairlines, two or three CSS columns depending on
  container width (`columns-2/3`), groups never break across columns. **[src]** `DeckLayoutText.tsx`,
  `DeckCardTextRow.tsx`; **[live]**.
- **Grid / Grid - Small:** one art tile per distinct card with an `xN` badge (top-right, outside the tile edge)
  and a chevron menu. **Grid - Overlap:** tiles overlap vertically (-140px margin) so only the title strip of each
  shows. **[src]** `DeckLayoutVisualGrid/DeckCardVisualItem.tsx`.
- **Stacks:** a column per group; each card is a stacked art strip (-240px overlap, only the name bar visible),
  badge `x3`. **Stacks - Split** repeats the strip once per copy (three Han Solo strips for x3) and puts the
  badge only on the first, which reads like a physical pile. **[src]** `DeckLayoutVisualStacks.tsx`; **[live]**
  (screenshot confirms: the last card in a stack shows its full face, the rest show only title bars).
- **With wording:** read-only grouped tables with small art and full card text. **[src]** `DeckLayoutWithWording.tsx`.
- **Layout dropdown shows a thumbnail preview of each option on hover** (images from their CDN), falling back to
  a description for With wording. **[src]** `DeckLayoutMenu.tsx`.
- **Sideboard:** Text puts it in a shaded box ("Sideboard (0)", "No cards in sideboard" when empty) at the end of
  the columns; a Maybeboard (board 3) appears below only when it has cards. Stats only count the main board. **[src]**
  `DeckLayoutText.tsx`, `DeckStats.tsx`; **[live]**. The count line "50 maindeck / 10 sideboard" sits above the list.

### 1.5 Leader / Base presentation

- **Always art, never text rows:** Leader card(s) and Base at 300px (200px when embedded on mobile) in the left
  column, with a flip-to-back button on Leaders (deployed side). **[src]** `DeckLeaderBase.tsx`, `DeckContents.tsx`;
  **[live]**. Formats with two Leaders show two tiles. In the compact pane the Leader row is replaced by a
  title bar with a deck avatar, the cleaned name (a trailing `[...]` is stripped) and a **Matches** popover. **[src]**
  `DeckTitlebarCompact/DeckTitleBarCompact.tsx`.
- Clicking Leader or Base art opens the selector only when the deck is editable. **[src]** `DeckLeaderBase.tsx`.

### 1.6 Stats and charts (the `Charts` tab)

- **A tab, not on the decklist tab.** `Decklist | Charts` (plus Collection and a comment count when applicable)
  as a segmented control in the toolbar; state in `?deckTab=charts`. Leader/Base and toolbar stay put. **[src]**
  `DeckActionsMenu/components/DecklistChartsTabs.tsx`; **[live]**.
- **Four charts:** Cost Distribution (stacked bar by cost 0-9+, coloured by card type), Aspect Distribution (donut),
  Set distribution (pie), Rotation blocks distribution (pie). Main board only. **[src]** `DeckStats/DeckStats.tsx`,
  `DeckCostChart.tsx` (Recharts), `DeckAspectChart.tsx` (Nivo); **[live]** first two seen.
- **Charts are filters.** Clicking a bar, slice or pie wedge sets a filter and scrolls to a card list on the
  right ("Cost: 5", "Aspect: Command") rendered with the same text row. **[src]** `DeckStats.tsx`,
  `DeckStatsSelectedCards.tsx`. It is the only drill-down in the view.
- **Counts:** only "N maindeck / N sideboard". No average cost, no type totals line, no resource or RAM
  equivalent (that is a Novastack concept; swubase has none to port). **[live]**

### 1.7 Hover, preview, zoom

- **Hover preview (desktop only):** hovering a text row opens a full card image to the left of the row with no
  delay (open and close delay both 0), portalled so it never clips; non-interactive (pointer-events off) in
  some layouts. **[src]** `DeckCardHoverImage.tsx`; **[live]** a full-size Obi-Wan card appeared to the left, over the Leader/Base column.
- **Click:** opens the card detail dialog by writing a search param on the current URL (`getCardDetailDialogSearch`),
  so the dialog is linkable and Back closes it. **[src]** `DeckCardTextRow.tsx`, `DeckCardVisualItem.tsx`.
  (I could not click a stacked tile live: overlapping strips intercept pointer events; click targets the title strip.)
- **Row chevron menu** (per card): board moves and quantity changes when editable. **[src]** `DeckCardDropdownMenu.tsx`.
- **Highlight:** a `highlightedCardId` prop ringed a card (used when arriving from card statistics). **[src]**

### 1.8 Tournament context

- **"Path through the event" table**, in the left column (and in a Matches popover in the compact bar): a header
  with the event name (links to the event) and "(63 players)", then "Player: Ya2Sabes #1 (7-0-2)", then one row per
  round: game score ("2-0"), opponent username, opponent's Leader name plus set code and base icon. **Rows are
  tinted green for a win, red for a loss, none for a draw**, and clicking one **swaps the pane to that opponent's
  deck** when they have one. **[src]** `DeckMatches/DeckMatches.tsx`; **[live]** (screenshot: eight rows, mostly
  green). It uses the same Leader+Base label renderer as the meta tables.
- **Context around it (list side) [live]:** a "Best placement by leader" strip of Leader art with a placement
  badge ("#1", "#2", "#4"...) above the table; each table row has a Leader label, set code, base-aspect icons,
  score, player; trophy icon on top-8 finishers.
- No placement banner on the deck itself beyond that header line; no mention of Day 2, Swiss rank vs top cut. **[live]**

### 1.9 Export, copy, print, share, image

- **Export dropdown:** download JSON, download text; copy JSON, copy text (clipboard). **[src]**
  `DeckActionsMenu/components/ExportOptionsMenu.tsx`, `/tmp/swu-repo/src/server/lib/decks/deckExport.ts`.
- **Share:** Copy link (warns if the deck is private). Duplicate; send to comparer; favourite. **[src]**
  `CopyLinkButton.tsx`, `DuplicateButton.tsx`, `ComparerButton.tsx`.
- **Image:** an `Image` button opens a dialog that renders a deck image from the live view, with presets for
  group-by, per-card art variant choice and export width, then download or copy. **[src]**
  `DeckImage/DeckImage.tsx` (909 lines), `DeckImageCustomization/*`. **[live]** the button exists; I did not open it.
- **Print:** no print stylesheet or button found in the deck components. **UNVERIFIED** beyond that search.
- **Import** from five sites with a "refresh from source" button on imported decks (owner only). **[src]**
  `RefreshImportedDeckButton.tsx`; "Imported from X" link under the title. **[src]** `DeckDetail.tsx`.

### 1.10 Legality, validity, price, comparison

- **Legality:** I found **no legality or size-validity flags in the read-only view**. The only warning band is
  "N cards are not implemented in Karabast" (their online play client), an amber alert above the list plus a
  per-card warning icon. The format shows in the deck metadata but does not gate anything here. **[src]**
  `DeckContents.tsx`.
- **Price:** per-source badges under the Leader art ("42.90 EUR / $86.11"), a `Prices:` source selector in the
  action bar (including None), an optional per-row price badge, a refresh button when no prices exist. **[src]**
  `DeckPricing/DeckPricing.tsx`, `PriceSourceSelector.tsx`, `DeckCardPriceBadge.tsx`; **[live]**.
- **Comparison:** "Add to comparer" puts the deck in a global tray (sidebar). `/comparer` shows decks side by
  side with a card-by-card table, group headers, per-deck quantity cells, and an "average deck" view that can
  be turned into a new deck. From tournaments, presets send Best 5/10/Top 8/16 of a Leader key. **[src]**
  `comparer/ComparerPage/DeckComparer/*`, and `swubase-surfaces.md` 3.4. Not opened live.
- **Collection tab** (signed in, opt-in): owned vs missing counts per card. **[src]** `DeckCollection/*`.
- **Comments / guide tab:** discussion and an owner-written guide. **[src]**

## 2. What they do well, ranked

1. **One deck component, mounted everywhere.** Page, event pane, bracket, matchup dialog and comparer share
   the same view and the same toolbar, so a player who learns it once gets it in every context, and every
   improvement ships to all of them. Why it works: no "tournament deck looks different from a saved deck" seam.
2. **The path table is coloured, compact and clickable.** One row per round with score, opponent and
   opponent's Leader, green/red by result, and a click that swaps the pane to the opponent's list. Why: it
   answers "how did this deck win" in one glance and turns the deck list into a graph you can walk. Nothing
   needs to be read to get the shape of the run.
3. **Art is present but separate from the list.** Leader and Base art sit in a left rail, the list is dense text
   (name, cost, aspect icons) and a full card image appears instantly on hover. Why: the list stays scannable in
   40 rows while art is one pointer-move away; no layout shift.
4. **Counts in group headers and a header line.** "Unit - Ground (36)", "Event (7)", "50 maindeck / 10
   sideboard" show composition without charts. Why: a reader can judge a build (36 ground units, 8 space) before
   reading a single card.
5. **Layout and group-by as two independent dropdowns with a remembered choice.** Eight layouts with hover
   thumbnails and seven groupings. Why: different readers want different views (a deckbuilder wants stacks, a
   scout wants text); the choice persists, so nobody re-picks it per deck.
6. **A pile-like Stacks view.** Overlapped title strips, copies repeated in the split variant. Why: it reads
   like a physical deck, the most direct translation of "how many copies" and "how many of each cost".
7. **Charts that are also filters.** Click a cost bar and see exactly those cards. Why: turns a static chart into
   a way to answer "what are my 5-drops?".
8. **Deck URL state.** `?maDeckId=`, `?deckTab=`, the card dialog param: pane, tab and card dialog are all linkable
   and Back works. Why: sharing "this deck in this event" is a link, not a screenshot.

Honourable mentions that are _not_ wins: mobile puts two big art tiles before the list; the toolbar is wide
(seven controls plus two dropdowns) and eats the pane; no legality display; six-colour gradient bar is decoration.

## 3. Novastack today, per idea

What exists **[src]** (Novastack repo, `src/`): `lib/components/tournaments/DeckDetail.svelte` (80 lines) builds
the tournament deck page and pane: header with Legend art tiles, RAM code, player, "Finished N of M ·
W-L-D · event · date"; a "Path through the event" list (round, W/L/D/BYE mark in green/red/yellow, opponent's
Legend art, opponent name, score); then `TournamentDeck.svelte` (38 lines): three plain-text columns Legends /
Main / Side, qty plus name, an "N lines didn't match" note. `routes/d/[code]/+page.svelte` (1167 lines) is the
saved-deck read view and is **much richer**: a three-column `240px | list | 280px` layout with a sticky
art preview panel that follows hover (falls back to the first Legend), a List / Gallery toggle stored in a cookie,
grouping by type, Legend slots, deck size status, cost curve, colour composition, rarity composition, an
"Eddiable" stat, price total with coverage, text export dialog (Melee / official / JSON), image export dialog,
collection tab, history tab. `DeckEditor.svelte` has `CardHoverPreview`; `CardDetailOverlay.svelte` is used on
`/collection`. Neither the tournament pane nor `/tournaments/decks/[guid]` use the saved-deck view.

| #   | swubase idea                                  | Novastack today                                                                                                                                                              | Status                                                     | Size to adopt                                                                                                                                             |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One deck component everywhere                 | Two parallel views: `DeckDetail` + `TournamentDeck` (plain text) vs `d/[code]` (rich, 1167 lines, owns its state). They share nothing.                                       | **Missing** for tournament decks                           | **Large** (extract list, stats rail and preview from `d/[code]` into components that accept resolved entries)                                             |
| 2   | Coloured, clickable path                      | Path list with W/L/D colours, opponent Legend art, score: present. Not clickable to the opponent's deck; opponents with no deck are not linked.                              | **Partly**                                                 | **Small** (link row to `?deck=` of the opponent when `PathRow` carries their deck guid; needs that guid in `PathRow`, derivable from matches + deck rows) |
| 3   | Art rail + dense text + instant hover preview | Tournament list is text only, no art per card, no hover. Saved-deck page has the sticky preview panel and Gallery.                                                           | **Missing** for tournament decks; **have** for saved decks | **Medium** (reuse `CardImage` + preview panel; hover wiring on the 38-line component; card art by slug is available from the dataset)                     |
| 4   | Counts in group headers                       | Tournament list: columns are "Main · N" and "Side · N" only; no type groups. Saved deck: groups by type with counts.                                                         | **Partly**                                                 | **Small** to **medium** (group `main` by card type via `groupDeckEntries`; needs card type from the dataset, which `present.ts` already resolves by slug) |
| 5   | Layout and group-by dropdowns, remembered     | List / Gallery toggle with cookie memory on saved decks; no group-by.                                                                                                        | **Partly**                                                 | **Small** (re-use cookie `deck-cards-view` in the tournament pane); group-by options (cost, colour) **medium**                                            |
| 6   | Stacks (pile) view                            | Gallery only (tiles). No overlapped stack.                                                                                                                                   | **Missing**                                                | **Medium** (pure CSS/markup; sideboard of 7 is small)                                                                                                     |
| 7   | Charts as filters                             | Saved deck has curve and colour bars; not clickable. Tournament deck has none.                                                                                               | **Partly**                                                 | **Small** (curve on tournament deck from dataset costs) plus **small** to make bars filter the list                                                       |
| 8   | Deck URL state                                | `?deck=` for the pane exists (route `decks/+page.svelte` renders `<DeckDetail layout="pane">`); tab and card-dialog params not present.                                      | **Partly**                                                 | **Small**                                                                                                                                                 |
| -   | Hover preview, zoom                           | `CardDetailOverlay` exists (click zoom); not wired to the tournament deck.                                                                                                   | **Partly**                                                 | **Small** (wire overlay to rows)                                                                                                                          |
| -   | Export / copy / image                         | `DeckExportDialog`, `DeckImageDialog` exist for saved decks; **no** export on a tournament deck. The one useful link ("open this tournament deck as a new deck") is missing. | **Partly**                                                 | **Small** (decks text is stored; `parseDeckImport` exists)                                                                                                |
| -   | Price                                         | `DeckPrice` exists for saved decks only.                                                                                                                                     | **Partly**                                                 | **Small** if `listEntries` can be built from `main` + `side`                                                                                              |
| -   | Legality flags                                | Saved deck has size status and RAM violations; swubase shows none. Tournament deck shows only "unresolved lines".                                                            | **Already ahead** (saved), **n/a** (tournament)            | none                                                                                                                                                      |
| -   | RAM / resource summary                        | `RamCode` in the header; no per-deck breakdown of cards that fall outside the Legends' RAM.                                                                                  | **Partly**                                                 | **Small**                                                                                                                                                 |
| -   | Compare decks                                 | None.                                                                                                                                                                        | **Missing**                                                | **Large** (needs a compare surface; start from "average deck")                                                                                            |

**Data gaps for the tournament deck.** `DeckDetail` has `main`/`side` as `{slug, quantity}` plus Legends and RAM;
cost, type and colour are not in the row but come from the card dataset by slug, the same way `cardName` does
(**[inferred]** from `present.ts` using the dataset; I did not read every field). So grouping, a cost curve and
art all need only the dataset, not new columns. `tournament_deck_cards` already supports the "decks running X"
direction but is not needed for this view. The one new need is the **opponent's deck guid on a path row** (idea
2), which can be joined from `tournament_matches` and the deck rows already ingested. The prior note records
that about 45% of players have no deck, so the clickable path must degrade to plain text for them.

## 4. Recommended order

1. **Give the tournament deck the saved-deck rendering (ideas 3, 4, 5, 7 in one go).** Extract the grouped
   list, the List/Gallery toggle and the preview panel out of `d/[code]/+page.svelte` into components over
   resolved entries, then feed them from `DeckDetail`'s `main` and `side`. One refactor delivers art, grouped
   counts, hover preview, the remembered toggle and the cost curve for tournament decks, and ends the
   two-views split (idea 1). Medium-to-large, but it is the gap the user feels.
2. **Make the path walkable (idea 2).** Add the opponent's deck guid to path rows and link them, with a plain
   fallback for no-deck opponents. Small; it makes the pane feel like swubase's best interaction.
3. **Ship "Copy / open as a new deck" and a text export on the tournament deck.** Small; reuses the
   export dialog and `parseDeckImport`, and is the link from a winning list into the deckbuilder.
4. Then, in order of cost: URL-backed tab and card dialog (idea 8), clickable cost bars (idea 7), a Stacks
   layout (idea 6), a compare view (large, wait for volume).

Skip: the six-colour gradient toolbar, eight layouts (Text / Gallery / Stacks cover the need), set and rotation
pie charts (no Cyberpunk equivalent).

## UNVERIFIED

- Print behaviour (no print stylesheet found in the deck components; not tested live).
- The deck image dialog and Export menu were not opened live; their contents are from source.
- The card detail dialog was not opened live (overlapping stack tiles intercepted clicks).
- Whether the `deckLayout` choice persists for signed-out visitors (user setting hook; storage not traced).
- The comparer was read in source only; not loaded live.
- Novastack's `PathRow` fields and the dataset field names used above were read at a glance, not traced.
