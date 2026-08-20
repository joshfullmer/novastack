---
status: accepted
---

# `slug` is the canonical Card Id

Every Card arrives from `api.netdeck.gg` with three usable identifiers — a UUID `id`, an
`external_id` (`cb-v-streetkid`), and a `slug` (`v-streetkid`). We use the **slug** everywhere:
in URLs, in the data snapshot, and in stored decklists. It is readable, it makes a decklist
survive as plain text (`4x v-streetkid`), and it is the only key the API accepts for a Card
detail lookup — UUIDs return 404 — so choosing anything else would mean maintaining a mapping
for no benefit.

## Considered Options

The obvious alternative is storing the UUID and treating the slug as a routing alias. That is
strictly more robust against renames, and it would match Printing Id, which _is_ a UUID. We
rejected it because it costs an indirection at every lookup and makes decklists and debug output
opaque, in exchange for guarding against an event — a publisher re-slugging a printed card — that
has not happened and would be visible immediately.

## Consequences

A re-slug upstream would break saved decks. Ingestion must therefore assert slugs are stable
against the previous snapshot and **fail the build** on drift, rather than silently importing a
renamed card. The UUID `id` is retained in the snapshot solely to power that check.

Note the deliberate asymmetry: Cards are keyed by slug, Printings by UUID. It is not an
inconsistency — a Printing has no good human key, since collector numbers are only unique within
a Set and get renumbered on reprint.
