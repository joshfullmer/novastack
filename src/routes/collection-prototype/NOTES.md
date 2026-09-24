# PROTOTYPE — collection page variants

Four variants of the collection page, switchable via `?variant=` on the throwaway
`/collection-prototype` route. **Delete this whole folder once a variant wins.**

> Everything above "Verdict" is the **original framing**, kept because it records why the model
> changed. The sections from "Verdict" onward are current.

## The question

Q4 of the grilling session settled that a **Binder is a partition of the Collection** — a copy
lives in exactly one Binder, and the Collection is the union of them. Then design recon found that
cyberdecktools — the site the feature was modelled on — does something different: its Collection
is **flat**, and a Binder is a separate display artifact of pages and 3×3 pockets whose quantities
are _explicitly independent_ of what you own ("Binder quantities are separate from owned copies").

Those are two different schemas. This prototype exists to decide between them by feel rather than
by argument, because the choice is expensive to reverse:

- **partition** — key is `(binder_id, printing_id)`; Owned Count sums across Binders.
- **display** — key is `(user_id, printing_id)` for the Collection, plus a separate pocket table
  carrying `(binder_id, page, pocket, printing_id, quantity)`.

## The variants

| Key | Name                  | Schema modelled | Bet                                                                                        |
| --- | --------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `A` | Set checklist first   | partition       | The checklist is the page; Binders are a scope dropdown. Most people have one Binder.      |
| `B` | Sidebar of containers | partition       | Binders and Wantlists are first-class navigation; you work inside one container at a time. |
| `C` | Binder as workspace   | **display**     | Arranging cards into pockets is the point; the flat collection is a ledger behind a tab.   |
| `D` | Entry console         | partition       | Entry speed beats browsing. Type a collector number, press Enter, never touch the mouse.   |

`A`, `B` and `D` share a schema and disagree only about hierarchy. `C` is the one that reopens Q4,
Q5 and Q15 — picking it means the `printing_lists` design changes shape.

`D` is borrowed from outside this genre: rapid entry from the MTG scanner apps (ManaBox, Delver
Lens, Dragon Shield companion), completion-by-rarity from digital CCG collection screens (MTG
Arena, Legends of Runeterra), and a "recently added" strip from Discogs/Letterboxd. It is the only
variant that treats _data entry_ as the primary job rather than a secondary affordance on a grid —
which is what Q2 said mattered most ("I want it to be easy to add a card").

`D` is not necessarily a rival to `B`: the likely real answer is `B`'s shell with `D` reachable
from it as an "Add cards" mode.

## What's fake

Everything in `fake-collection.svelte.ts`: in-memory only, seeded from a deterministic PRNG so all
four variants show the identical ~45%-complete collection and can be compared honestly. Card data
is **real** (`#lib/cards/index.js`), so density, art and set structure are true to life. No
persistence, no endpoint, no auth — those are what the prototype is checking, not depending on.

`C` deliberately surfaces the display model's one genuinely new failure mode: a pocket shelving
more copies than you own renders a red "shelved more than owned" warning. That inconsistency is
impossible in `A`/`B`/`D` by construction, and is the strongest argument against `C`.

## Findings so far

- **The dataset is 151 Cards / 700 Printings / 12 Sets**, not the 131/389 the earlier design
  discussion assumed. `MS01-WNC` alone holds **472** printings, and **150 of 700 printings are
  French** (`locale: fr`). Max rows per user is 700.
- ~~**A printing-level checklist is unusable without a "Combine printings" toggle.**~~
  Superseded — see "Sorting and the Off Goal filter". Collector-number sorting plus "Hide
  off-goal" solved this better, and Combine was deleted.
- **`B`'s "+N elsewhere" badge is the partition model's payoff made visible** — standing in one
  Binder, you can see that you hold more copies in another. The display model can't express this,
  because there is nothing to be "elsewhere" from.
- **`D` reproduces the Q9 ambiguity live**: typing `adam` returns seven rows with the identical
  card name, separable only by collector number, set and locale. That's the concrete reason
  paste-import was deferred — a name does not identify a Printing.

## Verdict

**Decided 2026-09-23, from looking at the four together: none of them wins outright, and the data
model changed as a result.** Seeing `B`'s "+N elsewhere" badge next to `C`'s pocket spread made it
clear the two were competing to own the same idea, and that neither framing was right.

The resolved model — see `CONTEXT.md` § Collection:

- **Collection** — one flat, unnamed, always-private record per user, a quantity per Printing.
  Presence means ownership. Binders do not partition it.
- **Binder** — several per user, named and shareable, arranged as Pages of Pockets. Presence means
  a wish to show the card off. Never ownership.
- **Wantlist** — several per user, unordered, target quantity per Printing.

So Q4 (Binder as partition) is **reversed**, and Q5/Q15's single-entries-table is **split**:
`printing_lists` keeps one shared parent for name/visibility/kind, with `binder_pockets` and
`wantlist_entries` as separate children.

What each variant contributed:

- **`B` — the shell.** Sidebar of containers is the right frame, but the rail now lists Binders
  and Wantlists _beside_ the Collection rather than as pieces of it, and the "+N elsewhere" badge
  is **deleted**: with a flat Collection there is no "elsewhere" to be in.
- **`C` — the Binder surface.** The pocket spread is right, and Q17 chose real addressable pockets
  with deliberate gaps over an ordered list. Its "shelved more than owned" warning is **gone** —
  Pockets carry no quantity, so the inconsistency it was warning about can no longer exist.
- **`D` — an add mode inside the shell**, not a page of its own. Rapid entry writes to the
  Collection; keep the collector-number-first matching, the per-entry undo and the
  completion-by-rarity rail.
- **`A` — the per-Set progress header**, and the problem that led to collector-number sorting.

## Collecting Goal (added after the model settled)

A user declares what "Complete" means to them by picking **Printing Runs** — a Run being one Set
in one Print Treatment and one Locale ("the Base Set's French run"). Seventeen exist today, and
only four Sets offer any choice at all: the Base Set has three runs (English beta 172, English
retail 150, French retail 150) and `SD01-HEI`, `SD02-EBP` and `PRM-WNC` have two apiece. The other
eight Sets have one run each, so they render as a single chip with "one run only".

A flat set of Runs, **not** a Set list crossed with Treatment and Locale lists. A cross product
cannot express a _diagonal_, and diagonals are the point: "base set French, everything else
English, and not base set English" is now a direct selection. Verified in the browser — swapping
the Base Set from `retail · EN` to `retail · FR` moves completion 152/332 (46%) → 146/332 (44%)
and the Base Set header to 66/150, while The Heist stays on `retail · EN`.

Defaults to every English retail Run: a denominator of **332** rather than 700.

`GoalEditor.svelte` is the control; `inGoal`, `completion`, `setProgress` and `rarityProgress` are
all Goal-scoped in `fake-collection.svelte.ts`. **Off Goal** printings are uncounted but not
untracked — badged `off goal`, still listed, still ownable, still in the copy total.

### Sorting and the Off Goal filter (second pass)

Two changes that turned out to be one change:

- **Sort by printed collector number, never by card name.** `slotsBySet` sorts within a Set using
  the existing `collectorNumberSortKey` (`#lib/cards/derive.ts`) — numeric part first so `9`
  precedes `10`, then verbatim so `005a` precedes `005b`. That's the order the physical set is in,
  so it's the order someone holding the cards is working in, and it clusters a Card's printings
  together (`001`, `001` fr, `β001`) instead of scattering them alphabetically.
- **"Combine printings" is deleted, replaced by "Show all"** (off by default). Combine actively
  fought collector-number order: collapsing a Card's printings into one row destroys the printed
  sequence. Hiding Off Goal printings does most of the same work — the base set goes 470 rows →
  149 — and the leftover duplication is only **37 same-Set alt-art siblings out of 282 en-retail
  (set, card) pairs**, which now sit adjacent in printed order rather than needing collapsing.

Both open questions the combine toggle had created are therefore **moot**: there's no combined row
to mis-badge, and no combined count to disagree with the percentage.

A filter is a **view preference and never changes the math** — the Set header reads 66/150 whether
Off Goal printings are shown or hidden, because the denominator is Goal-scoped, not view-scoped.
With "Show all" off the grid lists 332 rows; on, 700. The percentage doesn't move either way.

### Sorting in the real app — already handled, and deliberately

Corrected after reading the code: `/sets/[id]` **already** sorts by collector number, via a
_local_ `byCollectorNumber` over `collectorNumberSortKey`, and its file comment explains why it
isn't an extension to the shared `Sort` type. `card-database.md` §5 backs that up — collector-number
order already produces perfect colour/type grouping in the base set, so the explicit
Colour → Type → Cost default was chosen anyway for the readable cost curve, leaving
`Set → Collector Number` "**not reachable in stage 1**".

So there is nothing to add for P1: the Set checklist is already in printed order. A shared `number`
sort key is only needed if `/cards` itself should offer printed order, which is a separate call the
spec deferred rather than rejected.

### Other findings

- **A Set fully Off Goal reports "off goal"** rather than 0%, since `setProgress` returns
  `total: 0`. Showing 0/0 or 0% would read as failure rather than as a choice.

## Feedback log

Small changes requested while looking at the variants, so they don't get lost.

**Done:**

- **Variant B's rail is sticky.** `sticky top-nav` plus `self-start` — the second is load-bearing,
  because a flex item stretched to full height has nothing for `sticky` to stick to. Height is
  exactly `calc(100vh - var(--spacing-nav))` rather than a `max-h`, so the rail's right border runs
  the full viewport instead of stopping at content height, and a long rail scrolls inside itself.
  Verified pinned at 52px after a 2500px scroll.
- **The Collecting Goal moved out of the Collection pane** into its own destination in the rail,
  below Wantlists and beside Set progress / Export. `GoalEditor` gained an `alwaysOpen` prop so it
  drops its disclosure when it owns a pane. Variants A, C and D still mount it inline collapsed.
- **The Off Goal filter is phrased "Show all", not "Hide off-goal"**, so its default state is an
  _unchecked_ box. A checkbox that ships checked reads as something already done to the list, which
  invites unchecking it to "see properly"; unchecked reads as an option to opt into. Same
  behaviour, opposite polarity: off → 332 rows, on → 700.
- **A Run chip only carries its treatment label when the Set has both treatments.** Night City
  Brawl reads `EN 37`, not `retail · EN 37` — `retail` implies a beta run exists to be
  distinguished from, and for eight of the twelve Sets none does. Computed per Set from its own
  Runs, not globally.

**Still open:**

- Whether the goal belongs in the rail's _footer_ group (where it is now, with Set progress and
  Export) or as a peer heading alongside Binders and Wantlists. It's currently grouped with
  whole-collection actions, which reads right — but it's a _setting_, not an action, and it's the
  only thing in that group that opens a pane rather than doing something.
- Whether the rail should show the goal's percentage rather than its printing count, since the
  percentage is the number the rest of the page is about.

## Winner

**`B` — "Three peers in a rail".** Picked 2026-09-24. `C`'s pocket spread is kept as the Binder
surface inside it, `D` becomes an "Add cards" mode rather than a page, and `A` contributed the
per-Set progress header and the problem that led to collector-number sorting.

What to carry into production, in rough order of how load-bearing it is:

1. **Flat Collection, Binders as showcases, Wantlists separate** — ADR 0003. This is the part the
   prototype existed to decide.
2. **Collector-number sorting** via `collectorNumberSortKey`, never by card name. `/sets/[id]`
   already does this locally; nothing to add.
3. **The Collecting Goal as a set of Printing Runs**, defaulting to English retail (332 of 700),
   with "Show all" off by default and `off goal` badges on the rest.
4. **The rail**: Collection pinned at top and styled unlike the named lists below it, sticky with
   `self-start`, goal as its own destination.
5. **Rapid entry from `D`**: collector-number-first matching, per-entry undo, completion by rarity.
6. **Pockets with deliberate gaps and no quantities** (`PocketSpread.svelte`).

Nothing here is promoted yet. Rewrite properly when folding in — this was all written under
prototype constraints (no tests, no error handling, in-memory state).
