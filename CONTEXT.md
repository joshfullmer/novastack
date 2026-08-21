# Novastack

An unofficial fan-made card database and deckbuilder for the Cyberpunk TCG, built on card data
from `api.netdeck.gg`. This glossary is the project's ubiquitous language — the terms here win
over the names the API happens to use.

## Language

### Cards and printings

**Card**:
A card's mechanical identity — everything that affects play. One per distinct card in the game
(131 today). Two Cards are never mechanically identical.
_Avoid_: card object, gameplay card

**Printing**:
One physical manifestation of a Card — a specific art treatment in a specific set, with its own
collector number, rarity, and artist. A Card has two to six Printings. Purely cosmetic: no
Printing ever changes how a Card plays.
_Avoid_: variant, version, edition, art

**Default Printing**:
The Printing shown for a Card when nobody has chosen one. Supplied by the source data, not by
us; always the first entry in a Card's Printings.
_Avoid_: selected printing, primary printing, main printing

**Set**:
A named release that Printings belong to, identified by its printed Set Identifier — a main set, a
starter deck, a demo deck, a box-topper run, a promo run, a prerelease run. **Eight today.** The
source API reports twelve, because it splits each Set into separate retail and beta entries; that
split is the API's own and does not exist on the cards — see Print Treatment.
_Avoid_: expansion, release, product

**Base Set**:
The primary release a Card belongs to, as opposed to a Derivative Set. There is exactly one
today — Welcome to Night City — and it holds the overwhelming majority of Cards. The concept is
provisional: a second genuine release changes what "base" means, and the ordering rules derived
from it must be re-derived rather than carried forward.

**Derivative Set**:
A Set that repackages or supplements the Base Set rather than being a release of its own — a
starter deck, a demo deck, a box-topper run, or a promo run. Most Cards in a Derivative Set also
appear in the Base Set, but not all: a Card that appears _only_ in a Derivative Set is
**Set-Exclusive**. Note a beta twin is _not_ a Derivative Set — see Print Treatment.
_Avoid_: sub-set, secondary set, supplemental set

**Print Treatment**:
Whether a Printing is a retail or a beta copy. Orthogonal to Set: a retail and a beta card carry
the **identical** printed Set Identifier (`MS01 - WNC [A]` for both) and are distinguished only by
a `β` prefix on the Collector Number. The source API models these as two separate sets, which is
its own invention — treat them as one Set with two treatments.
_Avoid_: edition, variant, version

**Set Identifier**:
The code printed on a Printing: `<Set Category> - <Set Code> [<Cycle>]`, as in `MS01 - WNC [A]` or
`PRM - DD2 [A]`. Not exposed by the source API at all — it supplies only a slugified set _name_ — so
the mapping from API set to printed identifier is curated. Components can be absent: `PRR01 - WNC`
has no Cycle, and `PRM01` has only a Category. Twelve API sets reduce to **eight** printed
identifiers, because retail and beta share one.

**Set Code**:
The second component of a Set Identifier, naming the product line or deck — `WNC`, `HEI`, `EBP`,
`DD1`, `DD2`. **Not unique on its own**: `WNC` is shared by the main set, the box toppers, and the
prerelease run, which differ only by Set Category. Identity requires the Category and Set Code
_together_.

**Set Category**:
The leading component of a Set Identifier, naming the product type and its number — `MS01` (main
set), `SD01`/`SD02` (starter decks), `PRM` (promotional), `PRR01` (prerelease). **Part of a
Printing's identity, not just a grouping** — `PRM` alone spans three different Sets, and `WNC` alone
spans three different Categories. The pair `<Category>-<Set Code>` is what identifies a Set and what
appears in a Printing's URL.

**Cycle**:
The bracketed component of a Set Identifier, e.g. `[A]`. Believed to govern format rotation — which
Sets are legal in the current format. **The source API exposes no cycle data**, so rotation-aware
legality cannot be derived from it.

**Set-Exclusive**:
Said of a Card whose only Printings are in Derivative Sets — it was never printed in the Base
Set. Eleven today, all from the two retail starter decks plus one promo.

**Rarity**:
A property of a Printing, never of a Card. The same Card can be Rare in one Printing and Iconic
Legend in another.

**Collector Number**:
The identifier printed on a Printing, unique **within its Set only** — every Derivative Set
restarts at `001`, so `001` identifies three different Cards today. Any ordering or lookup keyed
on a Collector Number must be qualified by its Set. Beta Printings carry a `β` prefix; letter
suffixes distinguish art treatments of the same card (`005a`, `β144`) — which occurs on exactly
one Card today.
_Avoid_: print number, card number

### Card properties

**Color**:
A Card's single color identity — Red, Blue, Green, or Yellow. Determines which color of RAM the
Card draws on.
_Avoid_: faction, colour

**Cost**:
The resource cost to play a Card during a game.

**Power**:
A Card's strength in battle, used for both attack and defense.

**RAM**:
The deck-construction resource. A non-Legend Card _requires_ RAM of its own Color; a Legend
_provides_ RAM of its Color. The same word for both sides of the exchange, so prefer the
precise forms below when the direction matters.

**RAM Required**:
The threshold a Card imposes to be included in a deck. A Blue Card requiring 3 RAM is legal in
any deck whose Legends supply at least 3 Blue RAM. A **threshold, not a budget** — clearing the
bar admits unlimited copies, and including a Card consumes nothing.

**RAM Provided**:
The RAM a Legend contributes to a deck, in the Legend's own Color.

**Tag**:
A descriptive label placing a Card in a bucket — Netrunner, Corpo, and the like. Carries no
mechanical meaning on its own; other cards may reference it. **Tag** is the term the printed
rules use, so it is the term the interface uses. The source API calls the field
`classifications`, and that name survives in the data model where it mirrors the API — but
anything a player reads says Tag.
_Avoid_: subtype, trait, category

**Keyword**:
Shorthand for a mechanic the Card actually has. Unlike a Tag, a Keyword means something on
its own.
_Avoid_: ability, mechanic

**Eddiable**:
Said of a Card that can be sold. A sold Card goes face-down to the resource area and can be
turned sideways once per turn to produce resources.
_Avoid_: sellable, pitchable

**Legend**:
A Card type chosen during deck construction rather than played from hand. A deck picks three
Legends, and their combined RAM Provided per Color sets which Cards the deck may include.

### Identity

**Card Id**:
A Card's slug (`v-streetkid`). Canonical everywhere — URLs, stored data, and decklists — because
it is readable and is the only key the source API accepts for a Card lookup.
_Avoid_: card UUID, external id

**Printing Id**:
A Printing's UUID. Canonical for Printings, including mirrored image paths, because collector
numbers are only unique within a Set and are renumbered on reprint.

### Decks (stage 2)

**Deck Entry**:
A Card plus a quantity, plus optionally a chosen Printing. The Card carries identity and
legality; the Printing is cosmetic and may be left unset to fall back to the Default Printing.
_Avoid_: deck card, deck slot, deck item
