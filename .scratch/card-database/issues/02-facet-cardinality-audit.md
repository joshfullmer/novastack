# Facet cardinality audit

Type: research
Status: open
Blocked by: —

## Question

Which fields in the 131-card dataset actually discriminate enough to be worth a filter
control, and what does each one's value space look like?

Purely empirical — mine the data, don't judge intent. Fetch all 131 cards via the detail
endpoint (the list strips `printings[]`, notes §1) and report:

- Every scalar field's distinct values with counts — `card_type`, `color`, `rarity`,
  `legality`, `is_eddiable`, `finish`.
- Numeric fields — `cost`, `power`, `ram`: min, max, distribution, and how often each is
  null/zero/absent, broken down by `card_type`.
- `classifications[]` and `keywords[]`: distinct values, frequency, how many entries a
  typical card has, and whether the two vocabularies overlap.
- `rules_text`: length distribution, and roughly how many cards share common phrases
  (a rough signal for whether full-text search earns its place at this scale).
- Printing-level spread: how often a printing's `rarity`/`artist` disagrees with its card's
  flattened copy, and how many cards have art variants beyond a straight retail/beta mirror.
- Set codes actually present on printings, cross-checked against what `?set=` will match.

Flag any field whose values are near-uniform (useless as a filter) or near-unique (useless as
a facet, fine as search). Assert `total` moved whenever a query param is used — unknown
params are silently ignored (notes §1).

Deliverable: a markdown summary linked from this ticket, written to
`docs/research/facet-cardinality.md`. Keep concurrency ≤ 24.
