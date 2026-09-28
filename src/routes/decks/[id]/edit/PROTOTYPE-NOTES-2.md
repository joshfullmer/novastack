# PROTOTYPE round 2 — printing choice in the deck editor

**Question, restated after round 1:** round 1 proved the affordance wasn't the problem — the 360px
rail was. So: does the rail get **wider**, does clicking an entry open a **manager**, or both?

Round 1 (`PROTOTYPE-NOTES.md`) is closed; variants A/B/C are deleted.

## Run it

```
pnpm dev
/decks/<deck-id>/edit?variant=D
```

Flip with the fuchsia bar, or `←`/`→`. The switcher navigates shallow, so unsaved deck state
survives a variant change and all three can be judged against the same deck.

| `?variant=` | Rail  | Click an entry       | The bet                                                                                   |
| ----------- | ----- | -------------------- | ----------------------------------------------------------------------------------------- |
| `off`       | 360px | removes a copy       | Control — today's editor                                                                  |
| `D`         | 360px | opens the manager    | The rail doesn't need to grow if it stops hosting controls; it's a list of targets        |
| `E`         | 480px | nothing (tile inert) | No overlays at all — give the rail room and the controls fit, and art changes in place    |
| `F`         | 480px | opens the manager    | Both: a browsable deck at readable size _and_ one surface for everything you do to a card |

Measured, not estimated: the rail is 360 → 480px, the Gallery goes 4 → 3 columns, and tiles go
~80px → **146px**.

## What each variant actually does

**D / F — the manager** (`EntryManagerModal.svelte`). One surface per entry: art at 224px, copies
in deck _and_ sideboard side by side (the 3-copy cap spans both piles, so showing one without the
other makes a disabled `+` inexplicable), the full printings grid at 5 across, "Use default",
and "Remove from deck" as a labelled button.

It also kills a destructive default: today one click on a Gallery tile silently removes a copy.
Under D/F a tile click opens this instead, and the deck count doesn't move.

**E — inline controls** (`InlineEntryControls.svelte`). A real stepper (`− 2 +`) and a printing
cycler with the collector number and locale spelled out, under each tile and in each row. The
Gallery tile becomes inert: the controls do the work, so the gesture is redundant.

## What to watch for while judging

- **E's cost:** you can't see the alternatives before landing on them. Cycling a 14-printing Adam
  Smasher is 13 clicks and you only ever see one at a time. Does the live in-place art swap make up
  for that, or does it just make the deck flicker?
- **D's cost:** the rail stays cramped for _reading_. The manager fixes interaction, not density —
  is a 360px, 4-across gallery still worth looking at?
- **F's cost:** 480px comes out of the browse grid. At 1800px that leaves ~1200px, which still
  holds 8 columns comfortably — but check it at your actual window size, and on a laptop.
- **Sideboard parity:** round 1 skipped the 7; round 2 gives them the same treatment, so judge both
  piles.
- **Does the manager want to be `CardDetailOverlay`?** That component already does big art +
  printings grid + owned counts. If D or F wins, the real version should probably extend it rather
  than be a second modal — worth deciding now, while it's cheap.

## Stub, not real

Only the **printing choice** is stubbed (`printing-prototype.svelte.ts`, a `$state` map keyed by
card slug, reset on reload). Copies go through the real `deck-state.svelte.ts`, because the editor's
deck state is already local until "Save deck" — so a modal `+1` behaves exactly like a grid `+1`,
which is part of what needs judging. Gating (`choose-printing` in `#lib/entitlements.ts`) is absent
on purpose: free users will see no picker at all, so this round is about the entitled experience.

## Verified working (so a dud variant isn't mistaken for a dud idea)

Driven in a browser against local D1: D's manager opens from a row and steps copies 2 → 3, stops at
the 3-copy cap with the sideboard `+` correctly disabled, and swaps printing to the French retail
with the caption and selection ring following. E measures 480px / 3 columns / 146px tiles, its
cycler moves `010` → `β010`, its stepper moves 1 → 2, and its tile is inert. F opens the manager
from a tile — `aria-label="Manage …"`, deck count unchanged — and closes on Escape.

## Verdict — F wins

> "I definitely like F." — 2026-09-28

D and E are deleted; `?variant=off|F` is what remains, so F can still be compared against
production. Six changes were asked for on top of it, all now in:

1. **No hover preview in the Gallery.** At 146px the tile _is_ the preview, and a second copy of the
   art floating beside it was noise. List rows keep it — there is no art there to replace it.
2. **Overlaid copy controls** on the tile's bottom corners: `−` left, `+` right, quantity badge
   between them. They `stopPropagation`, so a stepper click doesn't also open the manager.
3. **Saving.** Not a save bug — the prototype's printing choice lived in a stub map that never
   wrote to the payload, so `printingId` was absent from every save. Choice now goes through
   `deck.setPrinting` into real deck state, so it persists; `#lib/decks/printing.ts` resolves it
   (and falls back to the default for an id that has left the dataset).
4. **Locale filter** in the manager — `All | EN | FR`, rendered only when the card has more than
   one locale.
5. **Selected-ring clipping** fixed: `ring-2` draws outside the border box, and the grid was flush
   against an `overflow-y-auto` container. The scroller now has `p-1`, which is where the ring goes.
6. **Legends** open the manager instead of being removed on click — the same destructive default,
   on the three cards a deck is built around. Legend mode has no copy steppers (they're slots), and
   removal frees the slot.

### Still open: a Legend's printing can't be chosen

`deck_versions.legends` is `string[]` — bare slugs — so there is **nowhere to store a Legend's
printing**. The manager shows the grid disabled with "Fixed for Legends" rather than pretending.

Fixing it means changing the payload shape (a valibot union of `string | { cardSlug, printingId }`
for back-compat, plus `legendSlugs` consumers in `/decks`, `/explore`, `/f/[code]` and the deck
view). That's the _most_ visible place a printing choice would land — Legends are what deck tiles
and OG images show — so it's probably worth doing, but it's a data-model change and wasn't in scope
for this round.

### Verified after the changes

Driven in the browser against local D1: tile steppers move `×2 → ×3` without opening the manager;
the hover preview is gone in Gallery and still present in List; the locale filter cuts 3 printings
to 1 (fr) / 2 (en) with every remaining tile matching; the selected tile has 4px of room inside the
scroller; a Legend opens in legend mode with 0 copy steppers, a disabled grid and "Remove Legend";
and choosing the French printing then pressing the real **Save deck** wrote
`"printingId":"dc8b5417-…"` into `deck_versions` and the deck view now renders that printing
instead of the English default.

### Not yet wired: gating

`choose-printing` (`#lib/entitlements.ts`) is still unenforced — the manager's printing grid is
visible to anyone who loads `?variant=F`. Nothing is exposed in production, since the affordances
are all behind the variant flag, but the gate has to go in before this ships.

To remove: this file, `PROTOTYPE-NOTES.md`, `printing-prototype.svelte.ts`,
`EntryManagerModal.svelte`, `InlineEntryControls.svelte`,
`#lib/components/PrototypeSwitcher.svelte`, and every `PROTOTYPE` marker in `+page.svelte`.
