# Grid + filter layout

Type: prototype
Status: open
Blocked by: 04

## Question

What does the card browse view look like and how does it behave?

Art-forward browse lives or dies here. Build a throwaway prototype — a scratch route, fake or
snapshot data, real card images if convenient — and iterate on it live until the layout is
settled. Use `/prototype` with `/frontend-design`.

Questions the prototype exists to answer:

- **Tile density.** How big is a card tile, how many per row at each breakpoint? Notes §4
  ships a 244w derivative sized for a ~120px tile — does the layout the prototype lands on
  agree, or does it demand a different width tier?
- **Filter placement.** Sidebar, sticky top bar, or a collapsed sheet? How does that change
  on mobile, where the grid wants the full width?
- **Control shapes.** Which filters are chips, which are dropdowns, which are sliders or
  steppers. Colour filters especially — swatches or labels?
- **Result feedback.** Where the count lives, how active filters are shown and dismissed,
  what the transition looks like as the grid narrows.
- **Tile content.** Is the tile bare art, or does it carry name/cost/stats? Art-forward
  argues bare — but bare art means no scanning by stats.
- **The blur-up in practice.** Notes §6 specifies card-colour → ThumbHash → real image.
  See whether the layered effect actually reads well on a full grid or is visual noise.
- **Empty and edge states.** Zero results; a set with 6 cards; the longest card name.

Aspect ratio is a hard 733:1024 across all 385 images (notes §3) — hardcode it, zero layout
shift. The prototype is throwaway; its resolution records the decisions, and the code is
deleted or left clearly marked as scratch.
