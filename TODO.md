- Combining Chips and Sliders makes things break

## Card click: zoom-in detail overlay

Clicking a card tile (not the stepper) should open a zoomed detail overlay, in the style of
cyberdecktools' card modal: the card animates up to full size, details pop in around it, other
printings of the same Card are listed, and copies can be managed from there — including the
Wantlist once it exists. Josh called this out specifically as the interaction he wants; the
animation is a large part of why it works there.

Current state, for whoever picks this up:

- `/cards` — a tile click selects into `CardPane`; a second click follows the link.
- `/sets/[id]` — `CardTile` is a real `<a href>`, so a click navigates to `/cards/[slug]`.
- `/collection` — **tiles have no link at all**, so a click does nothing. Fix this whichever way
  the overlay lands; it renders `CardImage` directly rather than `CardTile`.

Pieces that already exist and should feed it rather than being rebuilt: `CardHoverPreview.svelte`,
`CardPane.svelte`, `/cards/[slug]`'s printing chooser, and the `?printing=` param convention
(`PRINTING_PARAM`, `printingQuery()` in `#lib/cards/schema.ts`) for deep-linking a specific
printing.

Design questions it raises, none of them settled:

- Is it a route (`/cards/[slug]` with a view transition) or an in-place overlay? A route keeps deep
  links and the back button honest for free; an overlay keeps the grid's scroll position, which is
  the whole point on a 332-tile checklist.
- Per-printing management inside it means the overlay carries the printing-level ownership UI that
  `owned:` deliberately does *not* (that rolls up to the Card — see `predicate.ts`).
- The tile is currently an `<a>` on two surfaces; an overlay must not break middle-click,
  open-in-new-tab, or keyboard activation, which is exactly why `CardTile` is a real link today.
