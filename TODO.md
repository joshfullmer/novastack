- Combining Chips and Sliders makes things break

## Binders on a phone: a spread is the wrong shape for 390px

A shared Binder now fits the screen from `sm` up — the spread takes its aspect ratio from its own
card grid and the browser sizes it against the height available
(`/collection/binders/[id]/+page.svelte`). Below `sm` none of that applies, and the result is the
one left standing: six Pockets across a 390px viewport is ~45px per card, filling the top third of
the screen with the rest empty. Fitting won't help — it's already the full width.

The only real fix is to stop showing two Pages at once on a phone, which contradicts the page's own
stated invariant ("two Pages at a time, always, because that is what a binder is"). So it's a
deliberate open question, not an oversight:

- **One Page at a time below `sm`?** Doubles the card size immediately. Costs the spread metaphor
  and needs the turn animation to mean something different — a leaf swinging about a spine it no
  longer has.
- **Or keep the spread and let it be small**, on the grounds that a phone is not where you show
  someone a binder.

Whichever wins, the page strip's arrows are already the primary control at that width (the flanking
arrows are `hidden sm:flex`), so navigation doesn't block the decision.

## Card click: zoom-in detail overlay — built on `/collection`, not elsewhere

`CardDetailOverlay.svelte` does this on `/collection`: the card flies from the tile it was clicked
in, details land beside it, other printings switch in place, and copies and wanting are managed
from there. Recon on the interaction it was modelled on is in
`docs/research/collection-recon/cyberdecktools-card-detail.md`, including the measured timings.

Settled while building it, so it doesn't need re-deciding:

- **An overlay, not a route.** A route would have re-run the layout's session check and this page's
  wantlist queries to show a card the browser already had — and lost the grid's scroll position,
  which is the whole point on a 332-tile checklist. Deep links come from `?card=<printingId>`
  pushed shallowly, so Back closes and a link still opens the right card.
- **The FLIP is a `transform`**, not animated `width`/`height`/`left`/`top` (which is what
  cyberdecktools does, and is layout on every frame for the same movement).
- **The tile's art is a `<button>`.** It was inert before; the stepper and want button sit above it
  as siblings, so their clicks never reach it.

Remaining surfaces, none of them done:

- `/cards` — a tile click selects into `CardPane`; a second click follows the link. Deciding
  whether the overlay replaces that pane, or only exists on narrow screens where the pane is
  hidden, is the open question.
- `/sets/[id]` — `CardTile` is a real `<a href>` to `/cards/[slug]`. An overlay must not break
  middle-click, open-in-new-tab, or keyboard activation, which is exactly why it's a link today.
- `/collection/binders/[id]` — a filled Pocket is a drag handle with a clear button; clicking the
  art does nothing, and whatever lands there must not eat the drag gesture.

## Prices: launch day, 2026-11-06

English retail goes on sale on both marketplaces, and the price join needs a human look afterwards.
Retail is already mapped, with no price, so it should light up by itself — but check:

- **Cardmarket has no retail expansion yet** (0 cards), so `CARDMARKET_EXPANSIONS` has none for it.
  Add them once they exist; until then a retail printing has no Cardmarket quote at all.
- **Run `pnpm prices` and read the report.** TCGplayer retail numbers that don't join today
  (`005a`/`005b` against its `005`, the high numbers 143–167, `EOR01`/`NCB01` entries that aren't
  listed yet) may start to. `tcgplayer-beta-complete` guards beta only, so a retail gap will not
  fail a run — only the report shows it.
- **There is still no French run** on either marketplace; don't borrow the English price.
- Optional, and the owner's to do: apply to TCGplayer's Impact affiliate programme so the buy
  links earn something (`docs/research/prices.md` §2.2).

## Ideas — not started

From a scan of the other Cyberpunk TCG sites and of Magic/sibling-TCG deck sites (2026-10-07).
Context worth keeping: the sim and cyberdecktools already cover prices, ranked play, tournaments,
Draw Starting Hand / Draw %, and a Dice Play companion, so head-on parity with those is not the
play. Melee is the official organized-play platform and does **no validation** for Cyberpunk lists.

- **Format-aware legality (Standard / Wild / Pre-Release).** The sim's tournaments already run on
  formats and we have no format concept. M-sized; needs a curated rotation table, because the source
  API exposes no cycle data (`CONTEXT.md`, "Cycle").
- **Tournament-readiness check** for a Melee submission, plus a printable decklist form (SWUDB has a
  "Tournament Deck Form"). Client-side and deterministic; builds on the Melee export.
- **Deck compare / diff.** Two decks side by side: in A only, in B only, a similarity score. The
  version-diff logic already exists (`#lib/decks/version-diff.ts`).
- **Sample hand with odds** ("card X by turn N"). Small, but the sim has the basics, so low
  differentiation on its own.
- **Function tags** (removal, draw, …) searchable in the query language and shown as deck
  composition. About 150 cards, so hand-curating is tractable.
- **Community meta layer** — "played in X% of public decks with this Legend", average lists. Needs
  deck volume first; show the sample size and hide anything under about five decks. A cron
  precomputes it into a table.
- **Discord bot** (`/card`, `/deck <link>`) on a Workers HTTP interactions endpoint, reusing the
  query engine and the Discord login. Slash commands only: inline `[[card]]` lookups need a
  persistent gateway connection, which fits Workers badly.
- **Teams / co-owned decks**, as Piltover Archive has. Only worth it with a user base.

Ruled out for now: a ranked/tournament platform or sim (Melee and the sim own those), scanning and
mobile apps, and server-rendered OG deck images (Workers CPU limits).

## Imports — what was not verified

- The "Import it" hint on an empty `/collection`, and printing choices surviving a deck import,
  were never seen in a browser (the dev user owns cards, and lacks `choose-printing`).
- The official-builder and Melee text formats were read out of their sites' code, not from live
  exports; the sim's `A027` / `MS01-131A` code form is untested.
- No e2e for either import, or for prices: the suite has no signed-in flow.

## Housekeeping

- Mobile was not checked for the price row on the deck's Collection tab, the worth panel wrapping,
  or its popover.
- The README body still describes the project as it was at stage 1 ("133 card pages", …).
- `pnpm lint` fails on `main` with 10 Prettier warnings in files unrelated to recent work.
