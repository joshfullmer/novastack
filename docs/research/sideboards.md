# Research: sideboards in the deckbuilder

Read live off <https://cyberpunktcg.com/tournament-rules> on **2026-09-25** (the document's own
"LAST UPDATED" says SEP 25, 2026 — it released today). The page is a client-rendered SPA, so the
rules text below was extracted from the rendered DOM, not from the HTML response, which is a 2KB
shell. Every rule quoted here is quoted, not paraphrased.

Also measured: **netdeck.gg already ships sideboards for Cyberpunk.** Worth more than a normal
competitor look — cyberpunktcg.com's own footer reads "CARD DATABASE POWERED BY NETDECK.GG", and
the official site serves netdeck's bundle, so netdeck's reading of an ambiguous rule is close to
authoritative. Their zone config and validation were read out of
`https://cyberpunktcg.com/assets/index-DAAHzFqf.js`.

**Verdict: this is a small feature with a wide blast radius.** The rules are unambiguous about
everything that matters except one copy-limit question, the domain layer takes it cleanly, and the
editor needs no new tab. What costs real work is that ~12 call sites currently take `entries` and
`legends` and would each need to decide whether a sideboard counts.

---

## 1. What the rules actually say

**§D.1 Constructed Format** — the deckbuilding list, verbatim:

> - Minimum 40 and maximum 50 cards in the main deck
> - Exactly 3 Legend cards that do not share the same name
> - No more than 3 copies of any unique card name
> - **A sideboard of exactly 7 cards**
> - All cards must be "constructed legal"
>
> Cards in a constructed format deck must follow any and all deckbuilding guidelines and
> restrictions as outlined in the Cyberpunk TCG Comprehensive Rules, including but not limited to
> RAM values and more.

**§3.4.4 Sideboarding** — the load-bearing section:

> When it is appropriate to do so, either before the start of a round in a best-of-1 round or in
> between games during a best-of-3 round, players may choose to add or swap in cards from their
> 7-card sideboard in their deck. After sideboarding, the deck must still have at least 40 cards,
> and the sideboard can't have more than 7 cards. A player's main deck may not, under any
> circumstances, exceed 50 cards. **Sideboards may only include main deck cards. Players may not
> sideboard Legend cards.**

**§2.1.3 Legal decklists**: "Composition of Deck + Sideboard (40-50 Card Main Deck + 7 Card
Sideboard)". **§4.1 Deck & dice checks**: judges verify "the 3 Legends written, the 40-50 card main
deck, and the 7 card sideboard", each section "independently of the other".

**§C.2.2 "Quick" best-of-1**: "players bringing a constructed format legal best-of-1 deck **with no
sideboard**, however all other deckbuilding and material requirements must be met." So a
sideboard-less deck is a real, legal, named configuration — not merely an unfinished one. That one
sentence is what makes this feature safe to add to a database full of existing decks (§4).

**§D.2 Sealed** is a different animal: "Non-Legend cards opened but not used may be used as a
sideboard in best-of-3 events" — an unbounded leftover pool, no exactly-7. Sealed isn't a format
this app models at all today, and nothing below tries to.

What follows from the above, with no inference needed:

| question                  | answer                                                     |
| ------------------------- | ---------------------------------------------------------- |
| Size                      | exactly 7 at construction; never >7 mid-match              |
| Legends in the sideboard? | **No** — explicitly forbidden, twice                       |
| RAM budget applies?       | **Yes** — §D.1's "including but not limited to RAM values" |
| Sideboard-only cards?     | No — "Sideboards may only include main deck cards"         |
| Is 0 a legal sideboard?   | Yes, for quick best-of-1 (§C.2.2)                          |
| Swaps 1-for-1?            | No — "add or swap in", bounded by main ≥40 and ≤50         |

## 2. The one genuine ambiguity

**Is "no more than 3 copies of any unique card name" counted across main + sideboard, or per
zone?** §D.1 lists it as a flat deckbuilding rule, and §4.1 has judges verify each section
"independently" — which reads the other way. The rules never say.

netdeck resolves it as **combined**, and blocks the add with that exact wording:

```js
// canAddCard, from the shipped bundle — sums the deck and sideboard zones
e.zones.filter(s => s.zone_code === "deck" || s.zone_code === "sideboard")
        .reduce(...) >= 3
  ? { allowed: false, reason: "Maximum 3 copies allowed (deck + sideboard)" }
```

**Recommend matching netdeck (combined).** It's the genre-standard reading (MTG counts deck +
sideboard), it's what the official site's own builder enforces, and "Sideboards may only include
main deck cards" frames the sideboard as part of one deck rather than a second one. It's also the
conservative direction: a combined limit never produces a list that a per-zone reading would
reject. One `copiesOf(card)` helper is the whole implementation, so flipping it later is a
one-line change if a judge ruling says otherwise.

## 3. What netdeck already ships

Their Cyberpunk game config, verbatim from the bundle:

```js
zones: [
  { code: "legends",   name: "Legends",   exactCards: 3, maxCopiesPerCard: 1, showInEditor: true },
  { code: "deck",      name: "Deck",      minCards: 40, maxCards: 50, maxCopiesPerCard: 3, showInEditor: true },
  { code: "sideboard", name: "Sideboard", maxCards: 7,  maxCopiesPerCard: 3, showInEditor: false }
],
defaultZone: "deck"
```

Notable, and worth copying or deliberately not:

- **`maxCards: 7`, not `exactCards: 7`.** Their validator only ever complains about _too many_:
  `"Sideboard must have at most ${7} cards (currently ${n})"`. An under-7 sideboard is silent.
  Given §D.1 says _exactly_ 7, that's a gap on their side, not a rule we should mirror.
- **No third tab.** The sideboard has `showInEditor: false`; instead the card-search panel grows a
  two-button target toggle — `Deck` | `Sideboard 3/7` — and the tile click routes to the active
  target. Legends bypass it (`card_type !== "Legend"` guard) with the error "Legends go in the
  Legends zone".
- **Adding past 7 is blocked**, with a toast: `Sideboard is full (7 max)`.
- **RAM/playability filtering applies to sideboard adds** — the same `canAddCard` gate, whose
  reasons include "No {color} RAM — add a {color} Legend first".
- Their deck header reads `{n} Legends · {n} Main Deck · {n} Sideboard`, and their deck-image
  composer renders a separate `"Sideboard"` card row.

The convergence is useful: their target-toggle design falls out of the rules rather than taste.
Because Legends can't be sideboarded, the sideboard's card pool is _exactly_ the Main Deck tab's
pool — so a third tab would be a duplicate of the second one, and a toggle is the honest shape.

## 4. Why existing decks are safe

Every deck in D1 today has no sideboard. §C.2.2 makes "no sideboard" a legal configuration, so the
rule to implement is:

- **0 cards → no issue.** The deck is a legal quick-best-of-1 / casual list.
- **1–6 cards → a `DeckIssue`.** "Sideboard has 4 cards — a constructed sideboard is exactly 7."
- **7 → clean. 8+ → unreachable**, blocked at add time (below).

This matters beyond backwards compatibility: the **starter decks** (`decks.isStarterDeck`, flagged
by hand via `scripts/flag-starter-deck.sql`) are precons without sideboards, and an unconditional
exactly-7 check would light up every one of them as illegal on the Explore tab.

Blocking behavior fits the spec's existing doctrine (`docs/spec/deckbuilder.md` §4) without
amending it. The copy limit blocks on add because "there is no 'fix it later' workflow for a 4th
copy — it's noise, not a state worth representing." An 8th sideboard card is the same kind of
noise, so **block the add past 7** and report 1–6 as a non-blocking issue, exactly parallel to how
deck size 40–50 is reported and never blocked.

## 5. Blast radius in this repo

The domain layer is in good shape — `legality.ts` was written so "a future rule show[s] up
everywhere this is rendered just by pushing another `DeckIssue`", and that pays off here. The cost
is the number of call sites that currently take `entries` + `legends` as the whole deck.

### Data model

Recommend **a third array, not a `zone` field on `DeckEntry`**:

```ts
export const DeckVersionPayloadSchema = v.object({
	entries: v.array(DeckEntrySchema),
	legends: v.pipe(v.array(...), v.maxLength(LEGEND_SLOTS)),
	// New. `v.optional(..., [])` so pre-migration rows and the 0-sideboard case are the same value.
	sideboard: v.optional(v.array(DeckEntrySchema), [])
});
```

A `zone: 'main' | 'sideboard'` discriminator on `DeckEntry` is the tempting alternative and is
worse here: it leaves all ~12 existing consumers type-correct while making them silently _wrong_.
`deck.totalCards` would start reporting 47–57, the cost curve and color pie would fold in cards
that aren't in the deck, and the export would print 57 lines under `# Main Deck`. Each one would
need a filter nobody is forced to remember. A separate array turns every one of those into a
compile-time decision instead — and §4.1's "verifying each section independently of the other"
says the rules think of them as separate sections too.

Storage: one new column, one migration (`drizzle/0010_*.sql`):

```sql
ALTER TABLE `deck_versions` ADD `sideboard` text DEFAULT '[]' NOT NULL;
```

Cheap and additive. No backfill — the default covers every existing row, which is the correct value
for all of them.

### Files, and what each needs

| file                                           | change                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/decks/schema.ts`                          | `sideboard` on the payload; `SIDEBOARD_SIZE = 7`                                                                                     |
| `lib/decks/legality.ts`                        | `copiesOf` (main + side) for the 3-copy cap; sideboard in `ramViolations` / `notLegalCards`; new `DeckIssue` kind `'sideboard-size'` |
| `lib/decks/deck-state.svelte.ts`               | `sideboard` array, `addToSideboard` / `removeFromSideboard`, an `addTarget`, copy checks against the combined count, `toPayload`     |
| `lib/server/db/schema.ts`                      | the new column                                                                                                                       |
| `lib/server/db/decks.ts`                       | 3 writes: `createDeck` (`sideboard: []`), `saveDeckVersion`, `duplicateDeck`                                                         |
| `drizzle/0010_*.sql`                           | the `ALTER TABLE`                                                                                                                    |
| `routes/decks/[id]/edit/+page.svelte`          | Deck/Sideboard target toggle on the Main Deck tab, an `n/7` readout, a sideboard list in the deck panel                              |
| `routes/decks/[id]/+page.svelte`               | render the 7 as their own section; sideboard folded into `MissingPanel`'s entries (§6.1)                                             |
| `routes/decks/[id]/+page.server.ts`            | parse the new field (2 `v.parse` sites)                                                                                              |
| `routes/decks/[id]/edit/+page.server.ts`       | same, plus the save action's payload parse                                                                                           |
| `lib/decks/version-diff.ts`                    | sideboard diffs for Change History, or an explicit decision not to                                                                   |
| `lib/decks/export.ts`                          | `deckToJson` only — sim format deliberately unchanged until the sim is rechecked (§6.2)                                              |
| `lib/decks/deck-image.ts`                      | a sideboard strip; netdeck's own composer has one                                                                                    |
| `routes/explore/+page.server.ts`               | sideboard folded into `missingFor` (§6.1); leave `cardCount` main-only                                                               |
| `routes/decks/+page.server.ts`, `folders/[id]` | `cardCount` stays main-only; optional `+7` indicator                                                                                 |
| `lib/decks/stats.ts`, `grouping.ts`            | **no change** — they take `entries` and should keep meaning the main deck                                                            |

Tests: `legality.spec.ts` and `schema.spec.ts` are the two that must grow; `export.spec.ts` only if
the export format changes.

## 6. Decisions

1. **The sideboard counts toward "Missing" and the Buildable tab.** _Decided 2026-09-25._ The rules
   require all 7 cards physically present at the event, so they're cards you need copies of like
   any other — the same reasoning that already makes Legends count (`MissingPanel` and `explore`'s
   `missingFor`, the two call sites). Accepted consequence: any deck that gains a sideboard reports
   a larger Missing count than it did yesterday, and Explore's Buildable tab gets stricter for it.
2. **The sim text export omits the sideboard for now; JSON carries it.** _Assumed 2026-09-25,
   recheck ~2026-09-28._ `export.ts`'s format is verified against cyberpunk-tcg-sim.online's own
   export (2026-09-23), which predates sideboards existing at all — the rules released today, so
   **the working assumption is that the sim has no sideboard support yet.** An unrecognized
   `# Sideboard` header is the bad failure mode either way: if the sim keeps appending to the last
   section it saw, it silently imports a 57-card main deck. A lossy export beats a wrong one, so
   `deckToSimFormat` stays main-deck-only and `deckToJson` (ours, never claimed to match the sim)
   grows a `sideboard` key immediately.

   **To resolve:** export a 7-card sideboard from the sim itself and look at what it emits. If it
   emits a header, match it verbatim — the format's whole contract is "whatever the sim's own
   export produces." Until then the omission is deliberate, and `export.ts`'s doc comment should
   say so, so nobody reads it as an oversight.

3. **Change History granularity.** Sideboard swaps are the _most_ frequently edited part of a
   competitive list. Either diff them as a third section, or say in the code why they're excluded.
4. **Sealed format** — out of scope, confirming it stays out. Modelling it means an unbounded
   sideboard, ≥30-card decks, no RAM limits, and unlimited copies (§D.2): a second format, not a
   variation on this one.

## 7. Sizing

One wayfinder session, roughly: the domain + storage + editor changes are a few hours of real work,
and the long tail is the table in §5 — each row is small but none are optional if the feature is to
read as finished. Both of the decisions that could have expanded it are now settled (§6) — the sim
format is explicitly deferred rather than blocking, so nothing in §5 waits on an external answer.

## Provenance

| source                                                                             | holds                                                            |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| <https://cyberpunktcg.com/tournament-rules> §D.1, §3.4.4, §C.1–C.2.2, §2.1.3, §4.1 | every rule quoted here                                           |
| `https://cyberpunktcg.com/assets/index-DAAHzFqf.js`                                | netdeck's shipped zone config, validator, and editor UX          |
| `docs/spec/deckbuilder.md` §2, §4, §6                                              | the construction rules and block-vs-report doctrine this extends |
| `src/lib/decks/legality.ts`                                                        | the `DeckIssue` seam that makes §4's new rule a one-file change  |
