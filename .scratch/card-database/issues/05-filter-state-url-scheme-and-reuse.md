# Filter state: URL scheme and reuse

Type: grilling
Status: open
Blocked by: 04

## Question

Where does filter state live, how is it encoded, and how does it stay reusable in a stage-2
deck view?

Once the filter set is known, decide:

- **Source of truth.** URL query params, or component state with the URL as an output? A
  shareable "all Red Programs under 3 cost" link argues for the URL; the URL also survives
  reload and back/forward for free.
- **Encoding.** Repeated params (`?color=red&color=blue`), comma-joined
  (`?color=red,blue`), or something compact? What's the canonical form when a filter is
  cleared — absent param or empty value? Ugly-but-legible beats compact-but-opaque for a
  URL people paste into Discord.
- **Navigation semantics.** Typing in a search box must not push 20 history entries.
  Decide `replaceState` vs `pushState` per control, debounce behaviour, and whether
  SvelteKit's shallow routing or `keepFocus`/`noScroll` options are needed so the filter
  input doesn't lose focus mid-type.
- **The filter engine's shape.** Is filtering a pure function from (dataset, filter state) to
  results, isolated from Svelte and independently testable? That seam is what makes stage 2
  cheap — the deck view needs the same engine over the same dataset.
- **Derived vs stored.** With the whole dataset local, results are a `$derived` of state.
  Confirm nothing needs to be stored, and identify anything expensive enough to memoize
  (probably nothing at 131 cards — say so explicitly rather than optimizing).
- **Defaults and reset.** What does the bare `/cards` URL show, and is there a visible
  "clear all" affordance? How is "no filters" distinguished from "filters that match
  everything"?
- **Stage-2 reuse.** Name what the deck view will need from this model that the browse view
  doesn't — a second independent filter instance, scoping to a deck's cards — and check the
  chosen model doesn't preclude it.
