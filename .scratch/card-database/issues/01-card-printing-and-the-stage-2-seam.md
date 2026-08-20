# Card, Printing, and the stage-2 seam

Type: grilling
Status: open
Blocked by: —

## Question

What is the project's vocabulary for the two-tier card model, and which concept does a
future decklist point at?

The API flattens one chosen printing onto the card, so the same words mean different things
depending on where you read them (notes §2). Before any filter or route decision, pin down:

- **Card vs Printing.** What each one is, in this project's words, and which fields belong to
  which. `rarity`, `artist`, `set`, and collector number exist at both levels and can
  disagree — is the card-level copy "the default to display", or is it noise to discard?
- **The chosen printing.** The API calls it `selected_printing_id`; `printings[0].id` matches
  it. What do we call it, and who decides it — the API, or us?
- **Identity.** `id` (UUID), `external_id` (`cb-v-streetkid`), and `slug` all identify a card.
  Which is canonical in URLs, which in storage, which is treated as unstable?
- **Collector number.** `print_number` on the card vs `collector_number` on the printing hold
  the same kind of value. One name wins.
- **Game terms.** `classifications` vs `keywords` — what distinguishes them? What is
  `is_eddiable`? What are `cost`, `power`, `ram`, and does every card type have all three
  (Legends and Gear may not)? Which of these are nullable in practice?
- **The stage-2 seam.** A decklist entry references... what? A Card (gameplay identity,
  printing chosen at render time) or a Printing (the player picked that art)? This is the
  single decision that determines whether stage 2 needs a data-layer rewrite.

Resolution writes `CONTEXT.md` at the repo root as a glossary — terms only, no
implementation detail. Later tickets sharpen it inline rather than reopening this one.
