# Which filters does stage 1 ship?

Type: grilling
Status: open
Blocked by: 01, 02

## Question

What is the exact filter set for stage 1, and what are the semantics of combining them?

You supply the game knowledge here; the facet audit supplies the distributions to react to.
Decide, filter by filter:

- **Which facets ship.** From `color`, `card_type`, `cost`, `power`, `ram`, `classifications`,
  `keywords`, `set`, `rarity`, `is_eddiable`, `legality` — which earn a control in stage 1,
  and which are cut or deferred? Cut aggressively; a filter bar with eleven controls over 131
  cards is worse than one with four.
- **Combination semantics.** Within a facet: OR (Red *or* Blue) or AND (has *both*
  keywords)? Across facets: AND, presumably — confirm. Any facet where the intuitive answer
  is wrong for this game?
- **Numeric filters.** Exact values, ranges, or comparators (`cost <= 3`)? What happens to
  cards where the stat doesn't apply — does a Legend with no `power` match `power >= 0`,
  or drop out entirely?
- **Text search.** What does it search — name, subname, rules text, flavor text, keywords?
  Substring, word-prefix, or fuzzy? Case and punctuation handling (card names carry em
  dashes: `V — StreetKid`). Does it interact with the facets or override them?
- **Printing-level facets.** `set` and `rarity` live on printings, and a card can match a set
  through any of its printings (the API's `?set=` behaves this way). When a card matches via
  one printing, which art does the grid show — the default, or the matching one?
- **Card vs printing results.** Does the grid list 131 cards or 385 printings? A set filter
  makes this question unavoidable.

Every filter needs a stated reason it helps someone find a card. "The API has the field" is
not a reason.
