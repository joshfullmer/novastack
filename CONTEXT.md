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
A named release that Printings belong to — a retail product, its beta counterpart, a starter
deck, a promo run. Twelve today. Note that a single release exists as separate retail and beta
Sets, so a Card commonly has mirrored Printings across both.
_Avoid_: expansion, release, product

**Rarity**:
A property of a Printing, never of a Card. The same Card can be Rare in one Printing and Iconic
Legend in another.

**Collector Number**:
The identifier printed on a Printing, unique within its Set (`005a`, `β144`). Beta Printings
carry a `β` prefix; letter suffixes distinguish art treatments of the same card.
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

**Classification**:
A descriptive tag placing a Card in a bucket — Netrunner, Corpo, and the like. Carries no
mechanical meaning on its own; other cards may reference it.
_Avoid_: subtype, tag, trait, category

**Keyword**:
Shorthand for a mechanic the Card actually has. Unlike a Classification, a Keyword means
something on its own.
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
