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

## Verdict

_TBD — which variant, or which pieces of each._

To remove: this file, `PROTOTYPE-NOTES.md`, `printing-prototype.svelte.ts`,
`EntryManagerModal.svelte`, `InlineEntryControls.svelte`,
`#lib/components/PrototypeSwitcher.svelte`, and every `PROTOTYPE` marker in `+page.svelte`.
