# Recon: cyberdecktools' card detail overlay

Measured live on 2026-09-24 against <https://cyberdecktools.com/collection/>, signed out, in
Chromium at 1400×900. Everything below is observed — DOM read from the running page, animation
timings taken from `getAnimations()` and per-frame `getBoundingClientRect()` sampling — not inferred
from looking at it. Screenshots: `cyberdecktools-card-detail.png` (open),
`cyberdecktools-card-detail-midzoom.png` (~110ms into the zoom).

Recorded because we're building the same interaction on `/collection` and the *feel* was the part
worth copying. What we take and what we don't is at the bottom.

## What it is

A native `<dialog class="collection-detail">`, full-viewport `position: fixed`, opened from a
`<button class="collection-tile__open">` that wraps each tile's art. Vanilla JS in one bundle
(`collection-*.js`) — no framework markers in the DOM.

```
dialog.collection-detail                     1400×900, ::backdrop rgba(2,6,11,0.73)
└ div.collection-detail__stage               804×852
  ├ div.collection-detail__hero              420×839   ← left column
  │ ├ div.collection-detail__image           420×587
  │ │ └ div.card-preview-motion-surface      420×587   ← the thing that animates
  │ └ div.collection-detail__footer          420×241
  │   ├ p.collection-detail__owned                     "0 copies in your collection"
  │   ├ div.collection-detail__actions                 [− 1 +] [Add 1 copy] [Remove 1]
  │   ├ button.collection-detail__wishlist             "Save to wishlist…"
  │   ├ p.collection-detail__hint                      "Saved on this browser. Log in to…"
  │   └ retry/status nodes, 0×0 when idle
  └ div.collection-detail__panel              360×824   ← right column
    ├ header: h2.collection-detail__title + button.collection-detail__close (40×40, "×")
    └ body:
      ├ p.collection-detail__edition                   "Welcome to Night City — Beta #β011"
      ├ p.collection-detail__metadata                  "… · #β011 · Epic · Art by Łukasz Poller"
      ├ section.collection-price-panel                 EUR/USD rows, TCGplayer link, "Last known"
      ├ h3 "Other printings"
      └ div.collection-versions                        one button per printing, art + "×0"
```

## The animation

**The card animates its own box, not a transform.** `transform` stays `none` for the whole flight
while `width`, `height`, `left` and `top` all interpolate — a FLIP from the clicked tile's rect to
the hero's rect, on a dedicated `.card-preview-motion-surface` element.

Sampled per frame, opening (tile was 175×339 at 612,1080):

| t (ms) | box |
| --- | --- |
| 36 | 175×245 @ 612,1080 |
| 85 | 286×400 @ 557,604 |
| 134 | 364×508 @ 518,270 |
| 210 | 404×564 @ 498,101 |
| 309 | 418×583 @ 491,41 |

Three animations run together, from `getAnimations({ subtree: true })`:

| name | duration | easing |
| --- | --- | --- |
| `collection-scrim-in` | 240ms | linear |
| `collection-panel-in` | 320ms | linear |
| (WAAPI, the card) | 360ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` |

So: scrim first and quickest, card slowest on a decelerate curve, panel between them. The card is
still visibly moving after the scrim has finished, which is what makes it read as *the card* opening
rather than a dialog appearing.

**Closing is the same animation reversed** — the card flies back to its tile (420×587 @ 490,30 →
200×279 @ 600,975 over ~210ms) and only then does the dialog close. Symmetric, and it's the detail
that makes the overlay feel attached to the grid rather than dropped on top of it.

## Behaviour

- **Deep-linked.** Opening pushes `?card=printing:<uuid>`. Choosing another printing from "Other
  printings" swaps the hero *and* the URL to that printing's id — every printing is its own link.
- **Esc closes**, clears the param, restores scroll.
- **Backdrop click closes** too, same clean-up.
- **Scroll locked** while open (`body { overflow: hidden }`).
- **Focus** moves to the close button on open.
- **No prev/next.** ArrowRight/ArrowLeft do nothing; you close and click another card.
- Quantity controls are "stepper + Add N copies + Remove N" — a *pending amount* you then commit,
  not a direct ±1 on the collection.
- Signed out, everything writes to the browser and says so.

## What we take

- **The FLIP from the clicked tile.** This is the thing that makes it feel good, and it's the same
  technique as our binder drag ghost's landing tween.
- **Close flies back to the tile.** Cheap, and it's most of the charm.
- **Scrim / card / panel on three different clocks**, card slowest and on a decelerate curve.
- **Deep link per printing**, and Esc/backdrop closing it.
- **Other printings, switchable in place.**

## What we don't

- **Animating `width`/`height`/`left`/`top`.** That's layout on every frame. We get the identical
  movement from a composited `transform`, which is what `CardImage` and the drag ghost already do.
- **Prices.** Deferred deliberately (`CONTEXT.md` has no price vocabulary and the ingest has no
  price source).
- **The pending-amount stepper.** Ours is direct ±1 on the Collection and has been through several
  rounds of tuning; a second, differently-behaved stepper inside the overlay would be a third
  answer to "how do I change a number here".
- **A separate wishlist dialog.** We already have a default Wantlist and a one-click star, so the
  overlay can just use it.
