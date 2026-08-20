# Card data snapshot: shape, location, refresh

Type: grilling
Status: open
Blocked by: 01

## Question

How does card data get from `api.netdeck.gg` into the running app, and what shape does it
arrive in?

The image half of this is already decided (mirror at build time, keyed by `printing_id` —
notes §4). The data half is not. Decide:

- **When.** Build-time snapshot, or fetched at runtime? A build-time snapshot means the app
  never talks to the API in production; it also means a new set requires a rebuild.
- **Committed or generated.** Does the snapshot live in the repo (reviewable diffs, works
  offline, grows the repo) or get fetched during CI (always fresh, build depends on a
  third-party API being up)?
- **Where and in what form.** A generated TypeScript module, a JSON file imported by the
  build, a JSON file served from `static/`, or something queryable. This determines whether
  filtering can be pure and synchronous.
- **The normalization contract.** The mapper that turns API responses into our shape, per the
  vocabulary from *Card, Printing, and the stage-2 seam*: which flattened card-level fields
  are dropped, how `print_number`/`collector_number` unify, what happens to fields that are
  null across all 385 printings (`finish`), and how ThumbHash values attach to printings.
- **Validation.** Does the pipeline assert its assumptions — 131 cards, unique slugs,
  `printings[0].id === selected_printing_id`, non-empty `printings[]` — and fail the build on
  drift? Silent shape changes are the failure mode this pipeline is most exposed to.
- **Refresh.** What triggers a re-ingest, and how a stale snapshot is noticed. Notes §4
  proposes manifest-diffing `source_image_url`; does the card data get the same treatment?

Watch the trap: response bytes churn every request because signed URLs are re-minted, so
`ETag`s and byte-diffs are worthless as change detection (notes §3).
