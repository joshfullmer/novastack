# PROTOTYPE — printing choice in the deck editor

**Question:** what should choosing a Printing per deck entry feel like, in an editor that has two
very different modes (dense List rows, 4-col Gallery tiles) and cards with **2–14 printings** each?

Three variants on the real editor route, switchable with `?variant=`, hosted on live data and live
density — deliberately not a standalone page, because every affordance looks fine in a vacuum.

## Run it

```
pnpm dev
# then open your own deck's editor:
/decks/<deck-id>/edit?variant=A
```

Flip with the fuchsia bar at the bottom (dev-only), or `←`/`→`. The switcher navigates
**shallow**, so the in-progress deck state survives a variant change and all three can be judged
against the same deck.

| `?variant=` | Model | The bet it's making |
| --- | --- | --- |
| `off` | Today's editor, no picker | The control condition — what we're adding to |
| `A` | Inline popover thumbnail grid, anchored to the row/tile | You choose art by *seeing* the art; the grid from `CardDetailOverlay` already taught this vocabulary |
| `B` | Docked pane on the deck panel's left edge, driven by selection | Reprinting a dozen cards is one task, not twelve; a pane that stays open never covers the deck |
| `C` | `‹ 007 ›` cycling in place, plus a native `<select>` | Most choices are one or two steps away ("the beta one", "the French one") and nothing needs to open |

Affordances appear on the **main deck** only (List rows + Gallery tiles), not the sideboard — the
sideboard would reuse whichever wins, and leaving it out keeps the diff small.

## What to watch for while judging

- **Gallery, variant C:** the tile art swaps live as you step. That's C's whole argument — does it
  read as "choosing" or as "flickering"?
- **Variant A on a 14-printing card** (e.g. an Adam Smasher): does the popover stay scannable, and
  does it fight the hover preview pane that also wants that screen edge?
- **Variant B in List mode:** the pane is wide and the rows are dense — is the trip to the right
  edge worth it when the row itself is 24px tall?
- **Locale/treatment legibility:** A shows a collector number and a locale tag; B spells out set
  name + treatment + locale; C shows almost nothing until you commit. Which is enough?

## Stub, not real

`printing-prototype.svelte.ts` holds the choices in a module-scope `$state` map keyed by card slug.
**Nothing is saved** and `deck-state.svelte.ts` is untouched — the payload schema already has an
optional `printingId`, so persistence is a known quantity and not what this round is asking about.
Gating (`choose-printing` in `#lib/entitlements.ts`) is also deliberately absent here: free users
see no picker at all, so the round is about the entitled experience.

## Verdict

_TBD — fill in which variant won (or which pieces of each) before deleting._

To remove: this file, `printing-prototype.svelte.ts`, `PrintingAffordance{A,B,C}.svelte`,
`PrintingPaneB.svelte`, `#lib/components/PrototypeSwitcher.svelte`, and the four `PROTOTYPE`
markers in `+page.svelte`.
