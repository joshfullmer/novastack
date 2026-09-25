# Novastack

An unofficial fan-made card database and deckbuilder for the Cyberpunk TCG, built on card data
from `api.netdeck.gg`. This glossary is the project's ubiquitous language — the terms here win
over the names the API happens to use.

## Language

### Cards and printings

**Card**:
A card's mechanical identity — everything that affects play. One per distinct card in the game
(151 today). Two Cards are never mechanically identical.
_Avoid_: card object, gameplay card

**Printing**:
One physical manifestation of a Card — a specific art treatment in a specific set, with its own
collector number, rarity, and artist. A Card has two to fourteen Printings. Purely cosmetic: no
Printing ever changes how a Card plays.
_Avoid_: variant, version, edition, art

**Default Printing**:
The Printing shown for a Card when nobody has chosen one. Supplied by the source data, not by
us; always the first entry in a Card's Printings.
_Avoid_: selected printing, primary printing, main printing

**Set**:
A named release that Printings belong to, identified by its printed Set Identifier — a main set, a
starter deck, a demo deck, a box-topper set, a promo set, two prerelease sets, a tournament prize
set. **Twelve today.** The source API reports sixteen, because it splits most Sets into separate
retail and beta entries; that split is the API's own and does not exist on the cards — see Print
Treatment. (The two prerelease Sets are the one exception: `PRR01` and `PRR02` really are distinct
Sets, not a treatment pair — the API's `retail`/`beta` naming on them is coincidental, not the
usual split. Checked against the printed card, not assumed.)
_Avoid_: expansion, release, product

**Base Set**:
The primary release a Card belongs to, as opposed to a Derivative Set. There is exactly one
today — Welcome to Night City — and it holds the overwhelming majority of Cards. The concept is
provisional: a second genuine release changes what "base" means, and the ordering rules derived
from it must be re-derived rather than carried forward.

**Derivative Set**:
A Set that repackages or supplements the Base Set rather than being a release of its own — a
starter deck, a demo deck, a box-topper set, or a promo set. Most Cards in a Derivative Set also
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
has no Cycle, and `PRM01` has only a Category. Sixteen API sets reduce to **twelve** printed
identifiers, because retail and beta usually share one — see Set's note on the two prerelease
Sets being the exception.

**Set Code**:
The second component of a Set Identifier, naming the product line or deck — `WNC`, `HEI`, `EBP`,
`DD1`, `DD2`. **Not unique on its own**: `WNC` is shared by the main set, the box toppers, and both
prerelease Sets, which differ only by Set Category. Identity requires the Category and Set Code
_together_.

**Set Category**:
The leading component of a Set Identifier, naming the product type and its number — `MS01` (main
set), `SD01`/`SD02` (starter decks), `PRM` (promotional), `PRR01`/`PRR02` (the two prerelease
Sets). **Part of a Printing's identity, not just a grouping** — `PRM` alone spans three different
Sets, and `WNC` alone spans four different Categories. The pair `<Category>-<Set Code>` is what
identifies a Set and what appears in a Printing's URL.

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
restarts at `001`, so `001` identifies six different Cards today. Any ordering or lookup keyed
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

**Tournament Legal**:
Whether the source API itself considers a Card usable in a deck — a straight pass-through of its
`legality` field (`"legal"` / `"not-legal"`), not derived. Distinct from deck legality (§4 of
`docs/spec/deckbuilder.md`), which is about a _deck's_ size, RAM budget, and Legend names, not a
_Card's_ own status. First seen `false` in 2026-09, on a promo stub with no other stats yet — the
API gives no reason code, so this project reads it as a plain fact, not a ban.

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

**Main Deck**:
The 40–50 Deck Entries played from, as distinct from the Legends and the Sideboard. Say "main
deck" whenever a count could otherwise be read as including either.

**Sideboard**:
The 7 Deck Entries held aside and swapped into the Main Deck between games. Never contains
Legends, and is bound by the same RAM and copy limits as the Main Deck — the ≤3-copy limit counts
the two together. Exactly 7 for constructed play; zero is also legal (a deck simply without one).
_Avoid_: side deck, sideboard deck, extra deck

### Visibility

**Unlisted**:
Said of something reachable by direct link but absent from every browse surface, **where a public
tier also exists** — the middle of Decks' three tiers. The word only means anything by contrast
with "public"; where there is no public tier, the term is Shared.

**Shared**:
Said of something reachable by direct link, where no public tier exists at all — Binders,
Wantlists, and deck Folders. None of them is ever discoverable or browsable, so "unlisted" would
name the absence of a tier that was never offered. Describes current state, not capability: a
private Binder is perfectly _shareable_, it simply isn't shared.
_Avoid_: unlisted, shareable, link-only

### Collection (stage 3)

Three concepts, one job each: a **Collection** records what you own, a **Binder** shows off what
you choose to display, a **Wantlist** records what you are still looking for. Membership in one
says nothing about membership in another, and no two of them are ever summed together.

**Collection**:
The single flat record of what a user owns — a quantity per Printing, counted in Printings and
not in Cards. **Exactly one per user**, unnamed, never created or deleted. Presence in a
Collection means ownership and nothing else. Binders do **not** partition it: a Printing is never
in a Binder _instead of_ the Collection, and a Collection total is never assembled by adding
Binders up. **Always private**, and not because privacy is a setting it happens to default to — a
Collection has no sharing of its own at all, because showing cards off is precisely what a Binder
is for.
_Avoid_: library, inventory, cards owned, binder

**Binder**:
A named showcase of Printings a user wants to display. **Several per user**, each independently
shareable. Presence in a Binder means _a wish to show the card off_ — never ownership, which is
the Collection's business alone. Deliberately **not** the three other meanings the word carries
in this genre: a Binder is not a partition of the Collection, not a saved filter over it, and not
a printable Set checklist.
_Avoid_: folder, box, container, collection, showcase

**Binder Page**:
One spread of Pockets in a Binder, and the unit a Binder is paged through. Pages are ordered and
a Binder always has at least one.
_Avoid_: sheet, spread, sleeve

**Pocket**:
One addressable slot on a Binder Page, holding **at most one Printing**. A Pocket may be
deliberately empty — a held space for a card not yet pulled — so emptiness is a state a Pocket
_has_, not the absence of a Pocket. Carries no quantity: a Pocket displays a card, and "showing
off three copies" is not a thing. The same Printing may sit in Pockets in several Binders at
once, because displaying is not owning.
_Avoid_: slot, cell, binder entry, holding

**Wantlist**:
A named list of Printings a user is looking for, with a target quantity for each. **Several per
user.** Named alongside Binders and deliberately unlike one: a Wantlist is unordered and its
Printings carry a target quantity, where a Binder is arranged and its Pockets carry none. It
describes cards that are absent rather than cards on display.
_Avoid_: wishlist, needs, trade list

**Owned Count**:
How many copies of a Printing a user's Collection records. What the interface shows against a
card and what the `owned:` query field compares. Unaffected by Binders — putting a card on
display neither adds to nor subtracts from what you own. Zero is a real answer: a Printing is
never "unknown", only owned zero times.
_Avoid_: quantity, have count

**Printing Run**:
One Set in one Print Treatment and one Locale — "the Base Set's French run", "the Heist starter
deck's beta run". The unit a collector actually decides about, because it is the unit that was
physically manufactured as a batch. **Seventeen exist today**, unevenly: the Base Set has three
(English beta 172, English retail 150, French retail 150), three other Sets have two apiece, and
the remaining eight have one each, so most Sets present no choice at all. Combinations that were
never printed are not Printing Runs — there is no French beta run — so they are never offered.
_Avoid_: edition, variant, print batch, version

**Collecting Goal**:
Which **Printing Runs** a user is trying to collect, and therefore what **Complete** means for
them. Exactly one per user. It exists because the alternative is imposing one definition of a
finished collection on everybody: of 700 Printings, 218 are Kickstarter-only beta and 150 are
French reprints, so a collector after English retail cards is chasing 332 — and would otherwise be
shown a permanent ceiling of 47% for cards they never wanted and in many cases cannot buy.

A set of Printing Runs, rather than a Set list crossed with a Treatment list and a Locale list.
Treatment and Locale live _inside_ a Set — a beta Printing carries the identical printed Set
Identifier as its retail twin — so a Set-level choice cannot express them; and a cross product
cannot express a **diagonal**, which is a real thing to want: the Base Set's beta and French runs
_without_ its English retail run is three runs of 172, 150 and 150 Printings, and any cross
product that admits the first two admits the third.
_Avoid_: collection scope, filter, target, completion settings

**In Goal**:
Said of a Printing whose Printing Run is in the user's Collecting Goal, and so counts toward
Completion.
_Avoid_: tracked, in scope, wanted

**Off Goal**:
Said of a Printing whose Printing Run the user is not collecting. Off Goal means **uncounted, not
untracked**: the Printing still appears, can still be owned, and still contributes to a copy
total — a stray promo is a real card you may want recorded — it simply leaves both sides of the
Completion fraction. A user may hide Off Goal Printings from a listing, which is a view
preference and changes nothing about what they own. Also said of a whole Set, when none of its
Printing Runs are In Goal.
_Avoid_: uncounted, untracked, excluded, extra, out of scope

**Complete**:
The share of the Printings In Goal that a user's Collection holds at least one copy of. Always
relative to a Collecting Goal, never to the whole dataset, so two users with identical Collections
can honestly report different Completion.
_Avoid_: percentage, progress, done

**Missing**:
Said of a Card that a Deck needs more copies of than the viewer's Collection holds. Computed at
**Card** level, rolling up every Printing of that Card, because a Printing is cosmetic and any
copy can be played: a Deck asking for a retail Printing is satisfied by a beta one. Counted per
Deck independently — two Decks wanting the same Card both see it as held, even though only one
of them can be built at a time. **Unaffected by the Collecting Goal**: a Deck needs cards you can
actually play, and declining to collect a Set does not conjure copies of it. Goal governs
Completion, never legality or availability.
_Avoid_: needed, short, unowned
