---
status: accepted
---

# The Collection is flat, and Binders are showcases

A user's **Collection** is one flat, unnamed, always-private record — a quantity per Printing,
keyed `(user, printing)`. A **Binder** is a separate thing entirely: several per user, named and
shareable, arranged as Pages of Pockets, where presence means _a wish to show the card off_ and
never ownership. Binders do not partition the Collection, hold no quantities, and are never summed
into a Collection total. Ownership and display are two facts about a card, not one.

The alternative we spent most of the design on was the opposite: a Binder as a **partition** of
the Collection, `(binder, printing) → quantity`, with the Collection defined as the union of a
user's Binders. That is what choom.gg does, and it was the accepted design here until a prototype
made it look wrong.

## Considered Options

**Binder as partition** (rejected). Appealing because it models physical reality precisely: your
copies really are distributed across binders and deck boxes, and only that model can answer "which
of these could I trade away". It also makes "how many do I own" a derived value that cannot
disagree with itself. Rejected because it makes the common case pay for the rare one: every add
forces a "where does this go" decision, `Owned Count` becomes a sum over containers on every read,
and the concept has to carry two incompatible jobs — physical location _and_ curated display.

**Binder as display artifact with its own quantities** (rejected). cyberdecktools' model, which
states outright that "binder quantities are separate from owned copies". Rejected for that exact
reason: two independent quantities for the same physical card admit states that cannot be true,
like three copies shelved in a binder and one owned. Our Pockets carry no quantity at all, which
makes that class of inconsistency unrepresentable rather than merely warned about.

**One table for Binders and Wantlists.** Held while both were "a named container plus a quantity
per Printing", and dropped once Binders became positional and quantity-free while Wantlists stayed
unordered and quantity-bearing. `printing_lists` still holds the shared parent (name, kind,
visibility, owner), and `binder_pockets` and `wantlist_entries` are separate children.

## Consequences

**A Collection cannot be shared, and this is not a missing feature.** There is no visibility
column for it anywhere, because a Binder _is_ the sharing mechanism — that is the concept's entire
job. "Here's everything I own" is answered by generating a Binder from the Collection (or from a
filtered slice of it, e.g. `owned>=2` for a trade binder), which is additive and needs no schema
change. A future reader should not add `collectionVisibility` to the user row.

**`Owned Count` is a single column read**, not an aggregate, so the numeric `owned:` query field
(`docs/spec/query-language.md` §3) compares against one value per Printing with no summing.

**A Printing may sit in Pockets in several Binders at once**, and removing it from a Binder never
changes what the user owns. The reverse also holds: selling your only copy does not empty the
Pocket, because a Pocket records an intention to display, not a holding. Whether to surface that
divergence in the UI is a presentation choice, not a data-integrity problem.

**Pockets can be deliberately empty** — a held space for a card not yet pulled — so emptiness is a
state a Pocket has rather than the absence of a row.

This reverses the partition design recorded in the grilling session that preceded it; the prototype
that broke the tie is `src/routes/collection-prototype/` (throwaway — see its `NOTES.md` for what
each variant contributed).
