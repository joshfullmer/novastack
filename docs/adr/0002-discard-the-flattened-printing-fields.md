---
status: accepted
---

# Discard the flattened printing fields

The API copies one chosen Printing's `rarity`, `artist`, `set`, `print_number`, and `image_url`
onto the Card itself. Our normalized Card **drops all five**: those values live only on
Printings, and the Default Printing is `printings[0]`. The copies carry no information — they are
verbatim duplicates of `printings[0]` — but they can _disagree_ with the Printings the Card
actually contains, and reading them produces wrong answers with no error.

The concrete case: `V — StreetKid` is card-level `rarity: "Rare"`, but its `β144` Printing is
`Iconic Legend`. A rarity filter written against `card.rarity` silently omits that card from a
search for Iconic Legends. "What rarity is this Card?" is a malformed question — rarity is a
property of Printings, and this Card has two different ones.

## Considered Options

Keeping the copies under honest names (`defaultRarity`, `defaultArtist`) was the main
alternative: it makes a grid tile a single field read and makes the mistake _visible_ in review
rather than impossible. We chose discarding because it makes the bug unrepresentable, and the
ergonomic cost we were avoiding turned out not to exist — see below.

## Consequences

A future reader will notice our `Card` type has no rarity, set, or artist, and should not "fix"
it. Printing-level values are reached through `card.printings`.

Resolving the Default Printing is a field read rather than a search, because ingestion guarantees
`printings[0]` is the default — an invariant verified across all 385 Printings
(`printings[0].id === selected_printing_id`) and asserted at build time. `selected_printing_id`
is discarded along with the copies.

Filters over printing-level facets must quantify over the array — `card.printings.some(...)` —
which raises a real design question the filter work has to answer: when a Card matches a Set or
rarity filter through a non-default Printing, which art does the grid show?
