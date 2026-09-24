- Combining Chips and Sliders makes things break

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
