# Spec — Query language (stage 2)

A Scryfall-style text query language for novastack, replacing stage 1's per-facet URL params
with a single `?q=`. This document is implementation-ready: every design decision it records has
been made, on the wayfinder map at `.scratch/query-language/map.md`, one ticket per decision.
The places where one hasn't are collected under [Open questions](#open-questions).

**Scope.** The language (grammar, operators, precedence, vocabulary), how it maps onto the
existing `Predicate` tree, the `?q=` contract, the error model, and the Syntax documentation
page. **No parser code is written here** — this spec is what `/implement` builds from.

**Rationale lives elsewhere.** This spec says _what_; the reasoning, the corrections, and the
Scryfall research live in the wayfinder tickets it was assembled from (linked throughout) and in
`docs/research/scryfall-syntax.md`. It does not re-argue settled decisions.

**Supersedes, from `docs/spec/card-database.md`:** §6's per-facet URL scheme (replaced by `?q=`,
§7 below); §8.2's always-visible Row 1 / Row 2 filter rows (replaced by a panel that collapses
entirely behind one toggle, with only density staying always visible, §9 below). Everything else
in that spec — the dataset, the images, the `Predicate` tree itself, sort, routes — is inherited
unchanged.

---

## 1. Hard constraints

Inherited from stage 1, unchanged, and sharpened by what a parser specifically demands:

1. **No type coercion.** `as`, `!`, and other assertions are forbidden. A parser is _entirely_ a
   boundary — every token and AST node is earned by parsing, never asserted. This is also why the
   parser is hand-rolled rather than a dependency (§8): several real candidates were disqualified
   on this constraint, not just on size.
2. **A null is a distinct bucket and never zero.** A bound never admits null. The language must
   express both "has no value" and "has any value" for every nullable field, exactly as the live
   `+ none` toggles already do.
3. **Malformed input degrades, it does not throw.** Unknown fields, bad values, and unclosed
   groups are dropped with a recorded warning, never a thrown error — turning this into a grammar
   constraint (§6), not a UI nicety. This is a deliberate _tightening_ from stage 1's own tested
   behaviour, not mere continuation of it: see §6.
4. **The URL is the only source of truth.** `?q=` replaces the per-facet params as that truth;
   `?sort=` stays beside it, untouched (§5).
5. **The `Predicate` tree in `src/lib/filters/predicate.ts` is the fixed target.** A parser
   compiles into it. Every decision below was checked against the actual tree and evaluator by
   hand; genuine gaps are recorded as additive extensions in §4, never as a redesign.

---

## 2. Grammar

### 2.1 Productions

```
Query         ::= OrExpr
OrExpr        ::= AndExpr ( "or" AndExpr )*
AndExpr       ::= NotExpr ( "and"? NotExpr )*        (* whitespace-separated; "and" is a no-op *)
NotExpr       ::= "-"? Atom
Atom          ::= "(" OrExpr ")" | Clause
Clause        ::= FieldClause | BareText
FieldClause   ::= Field Operator Value ( ChainOp Value )?
BareText      ::= Word | QuotedString | Regex

Field         ::= <one of the keywords in §3>
Operator      ::= ":" | "=" | "<" | "<=" | ">" | ">="
ChainOp       ::= "<" | "<=" | ">" | ">="            (* must agree in direction with Operator *)
Value         ::= Word | QuotedString | Regex | "none" | "has" | LegendsValue | Number

Word          ::= /[^\s"()]+/
QuotedString  ::= '"' ( [^"\\] | "\\" . )* '"'
Regex         ::= "/" ( [^/\\] | "\\" . )* "/"
LegendsValue  ::= ( ColorLetter Digits? ","? )+
ColorLetter   ::= "r" | "y" | "g" | "b"               (* case-insensitive *)
```

Which `Operator`s, `Value` forms, and whether `ChainOp` is legal at all are **field-kind
constraints, not grammar-wide ones** — a pure CFG that encoded them would obscure more than it
clarifies. §3 states them per field, as a table, the same way stage 1's spec used prose-plus-table
over a single unified rule wherever the constraint was semantic rather than syntactic.

`and`/`or`/`-` are reserved **positionally** — a bare word `or` is always the connective;
searching for the literal word requires quoting it (`"or"`). This is inherited directly from
Scryfall, which has the same limitation. `has`/`none` are reserved only in a value slot
immediately after `Field Operator` — a bare `has` typed as search text is unaffected.

### 2.2 Precedence

| level        | binds                               | note                                            |
| ------------ | ----------------------------------- | ----------------------------------------------- |
| 1 (tightest) | `( )`                               | grouping                                        |
| 2            | `-`                                 | one `Atom`                                      |
| 3            | implicit AND (juxtaposition), `and` | greedy — absorbs everything up to the next `or` |
| 4 (loosest)  | `or`                                |                                                 |

The one non-obvious rule, verified live against `api.scryfall.com` rather than assumed: **`a or b
c` parses as `a or (b c)`, not `(a or b) c`.** Juxtaposition binds tighter and greedily absorbs
everything up to the next `or`. `and` exists as a documented no-op synonym for juxtaposition —
`a and b` ≡ `a b`.

Origin: [Scryfall's grammar in detail](../../.scratch/query-language/issues/01-scryfall-grammar-in-detail.md),
[Operator set and precedence](../../.scratch/query-language/issues/03-operator-set-and-precedence.md).

---

## 3. Field vocabulary and operators

| leaf                             | keyword(s)                    | operators       | value                                           | null / empty                                               | chained range |
| -------------------------------- | ----------------------------- | --------------- | ----------------------------------------------- | ---------------------------------------------------------- | ------------- |
| color                            | `color:` `c:`                 | `:` `=`*        | Color enum                                      | never null                                                 | no            |
| cardType                         | `type:` `t:`                  | `:` `=`*        | CardType enum                                   | never null                                                 | no            |
| keyword                          | `keyword:` `kw:`              | `:` `=`*        | Keyword enum, or `none`/`has`                   | array-empty (`empty`)                                      | no            |
| tag                              | `tag:`                        | `:` `=`*        | quoted or slug string, or `none`/`has`          | array-empty (`empty`)                                      | no            |
| cost                             | `cost:`                       | `: = < <= > >=` | integer, or `none`/`has`                        | null bucket                                                | yes           |
| power                            | `power:` `pow:`               | `: = < <= > >=` | integer, or `none`/`has`                        | null bucket                                                | yes           |
| ram (required)                   | `ram:`                        | `: = < <= > >=` | integer, or `none`/`has`                        | null bucket                                                | yes           |
| eddiable                         | `eddiable:` `ed:`             | `:` `=`*        | `true`/`false`                                  | never null                                                 | no            |
| set                              | `set:` `s:`                   | `:` `=`*        | quoted or slug string                           | never null                                                 | no            |
| rarity                           | `rarity:` `r:`                | `: = < <= > >=` | Rarity enum                                     | never null                                                 | yes           |
| text (bare / `name:` / `rules:`) | _(none)_ / `name:` / `rules:` | `:` `=`*        | word, quoted phrase, `/regex/`, or `none`/`has` | rules-haystack-empty (`empty`); `name:none` always dropped | no            |
| ramBudget                        | `legends:`                    | `:` `=`*        | tally/digit color value (§3.3)                  | n/a                                                        | no            |

`*` — `=` is a **harmless alias of `:`** for every field so marked; the two never diverge in
behaviour. Chips always emit `:`.

Case-insensitive throughout, for field names and enumerated values alike. Multi-word values
accept either a quoted display string (`tag:"Tyger Claws"`) or the slugified hyphen form
(`tag:tyger-claws`) — the latter isn't a special rule, it falls out of hyphens being ordinary
value characters. `cost:` has no short alias, deliberately, so `c:` stays color's alone.

Origin: [Keyword vocabulary](../../.scratch/query-language/issues/02-keyword-vocabulary.md).

### 3.1 The `:` / `=` split

Real at-least/exactly semantics are kept for **Color and Card Type only** — both are scalar
today, so `:` and `=` currently behave identically, but the split is kept deliberately
forward-compatible: if either field ever becomes multi-valued, the semantics don't need to
change, only the set of cards where they diverge grows.

This is a considered departure from symmetry with Scryfall, not an oversight: live cross-check
against `api.scryfall.com` found that `keyword=flying` — Scryfall's own nearest analogue to a
set-valued non-color field — matched cards with _multiple_ keywords, not just `['Flying']`.
Scryfall itself reserves the real exact-set `=` for color, color identity, and mana cost only,
and treats every other field's `=` as a plain alias of `:`. Novastack follows that precedent
exactly, rather than the naively symmetric "every field gets the split" reading.

Origin: [Operator set and precedence](../../.scratch/query-language/issues/03-operator-set-and-precedence.md).

### 3.2 Comparison operators and ranges

`> < >= <=` apply to the three numeric fields (Cost, Power, RAM) and to **Rarity**, via the
existing curated total order (`RARITY_ORDER` in `vocabulary.ts`) — this exposes an ordering the
data model already commits to, not a new capability. No other enumerated field gets comparison
operators: Type and Set have no defined order, and accepting `>` there would silently pick an
arbitrary one nobody asked for. `c>red` is a syntax error, not a mystery ranking.

A **chained interval** is sugar available on every comparison-capable field, one grammar
production rather than one per field: `1<=ram<=3`, `rarity<=epic`, etc. Direction must agree
(`1<=ram>=3` is rejected); strict and non-strict may mix (`1<ram<=3` is valid). It compiles to the
identical `Predicate` node as the two-clause form (`ram>=1 ram<=3`) — pure sugar, zero evaluator
impact.

Integer-only fields (Cost, Power, RAM) mean strict `<`/`>` desugars losslessly to the adjacent
inclusive bound: `cost>3` ≡ `cost >= 4`.

### 3.3 `legends:` — the colored RAM budget

The one predicate with no Scryfall analogue and no scalar value — entirely novastack-original
syntax. It encodes **raw per-color RAM numbers directly**, not Legend slot-counts: `legends:r2y4`
means "Red pool 2, Yellow pool 4," full stop. This is deliberately decoupled from
`ramPerLegend` (currently uniform at 2) ever becoming non-uniform per Legend — the query's
meaning never has to change if that happens, since it was never expressed in terms of "how many
Legends," only in terms of the resulting pool.

**One unified rule** produces both a tally spelling and a digit spelling for free, not two
features. A value is a sequence of color-letter tokens (`r`/`y`/`g`/`b`, case-insensitive); each
token is a color letter optionally followed by digits. A bare letter contributes 1 to that
color's running total; a digit-suffixed letter contributes that number. **The final total per
color is the sum of all its occurrences.**

```
legends:rryyyy    Red 2, Yellow 4
legends:r2y4      Red 2, Yellow 4   — identical to the above
legends:rry4      Red 2, Yellow 4   — mixing spellings within one value is fine
```

No separator is ever required — a color letter always unambiguously starts a new token, since
digits can't. An optional comma is accepted as pure chrome the parser skips. Order and
interleaving never matter. Unmentioned colors default to 0.

**No upper bound and no achievability check, deliberately.** `admits()` (`src/lib/filters/budget.ts`)
already accepts any `ColorBudget` without caring whether three real Legends could produce it;
validating "could this be built" would undercut the forward-compat reasoning above. Negative
values are dropped as malformed, per §6's ordinary treatment of nonsensical numeric input.

**Canonical form is tally.** Today's chips can only ever produce 0/2/4/6 per color (0–3 slots ×
the current uniform 2), so tally output never exceeds six characters per color in any real case;
chips serialise tally. Digit form remains an accepted, equally-valid input spelling.

**Negation** uses the generic `not` node, not operator inversion: `admits()` is a flat boolean
with no direction to invert, and it already resolves `ramRequired ?? 0` before negation would ever
see it, so there's no null-rule interaction to get wrong.

Origin: [`legends:` — text syntax for the colored RAM budget](../../.scratch/query-language/issues/05-legends-ram-budget-syntax.md).

### 3.4 Text search

Bare, unprefixed words keep the exact combined name+rules-text substring meaning stage 1 already
built — zero migration cost, zero behaviour change. Two new precision keywords are pure
additions: `name:` and `rules:` (not Scryfall's `o:`/oracle — "rules text" is this codebase's own
term, and there is no meaning here for "oracle"). Neither gets a short alias: `r:` already
belongs to Rarity.

**Unquoted multi-word runs are implicit AND of separate words**, not an implicit phrase —
`night city` means "night" AND "city" anywhere in the haystack, following the same tokenization
rule as everything else in the grammar rather than a special case. Quotes remain the only route
to an exact phrase: `"a rival unit"`.

Substring matching is unchanged: `ADIA` still matches `Nadia — Fighting Through Grief`. `€$` and
`☆` stay unsearchable, as today.

**`rules:none`** means the rendered rules-only searchable haystack is empty — matching what the
site's own renderer already treats as one empty state (a genuinely-null `rawRulesText`, or a card
whose entire text was `[Flavour]`-tagged) — not literally `rawRulesText === null`. **`name:none`
is always dropped as inapplicable**; no card ever has an empty name.

Segment-kind targeting (e.g. "cards that reference another card") is explicitly declined, not
omitted by accident — a real, interesting capability unique to this project's structured
rules-text model, set aside for lack of demonstrated need.

Origin: [Text search in the language](../../.scratch/query-language/issues/06-text-search-in-the-language.md).

### 3.5 Nulls: `field:none` / `field:has`

Reuses the exact vocabulary already on the live site — the `+ none` toggle's own label — so
nothing new needs learning between the chip UI and typed queries.

```
cost:none                 no cost at all (18 cards, snapshot)
cost:has                  has a cost, no bounds
(cost>=2 cost<=4) or cost:none   the bounded range, or no cost — plain disjunction, no new syntax
```

Composing a bound with the null bucket needs **no dedicated syntax** — stage 1's bespoke
`?cost=2-4,none` URL token existed only because that grammar had no connectives. Here it's a
plain `or` of two independently meaningful clauses, traced by hand through the evaluator to
confirm it composes correctly with zero special-casing.

Negation is the plain `not` node: `-cost:none` ≡ `cost:has`, because a presence test is
membership-style (§3.6), not an ordered comparison — there is no null-rule ambiguity in negating
"is this null" itself.

**Scope, generalised beyond the three numeric fields.** Tags and Keywords get the same
`field:none`/`field:has` syntax, meaning array emptiness (`classifications: []` is real data: 58
of 133 cards have no keywords, snapshot). Color, Card Type, Eddiable, Rarity, and Set are
schema-guaranteed never-absent: `color:none` is **dropped as an inapplicable clause** (§6), never
compiled into a silent always-false predicate.

Origin: [Nulls in the language](../../.scratch/query-language/issues/04-nulls-in-the-language.md).

### 3.6 Negation

| category                       | fields                                                                        | mechanism                                                     | null under negation       |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| Membership                     | color, cardType, keyword, tag, set, rarity-as-membership, eddiable, ramBudget | generic `not` node, true complement                           | included where applicable |
| Ordered comparison             | cost, power, ram, rarity-as-comparison                                        | **parser-level operator inversion**, compiled to a fresh leaf | always excluded           |
| Presence test (`:none`/`:has`) | any nullable field                                                            | generic `not` node                                            | n/a                       |

Membership negation maps directly onto `{ kind: 'not', child }` wrapping the leaf — the existing
evaluator (`!test(child, …)`) already does the right thing: a card with no tags at all correctly
evaluates the child to `false`, and the wrapped result to `true`.

Ordered-comparison negation is **deliberately not** the generic `not` node. `-(cost>=3)` ≡
`cost<3`; `-(cost=3)` ≡ `cost!=3` ≡ `cost<3 or cost>3`. Wrapping a numeric leaf in generic `not`
would flip `includeNull` too — a null-cost card evaluates the un-negated bound to `includeNull`,
so wrapping in `not` would flip it to admit null, making `-cost>=3` disagree with the plainly
equivalent `cost<3` on whether nulls are included. Operator inversion at the parser keeps "a
bound never admits null" uniformly true, negated or not. Negating a chained range decomposes to
an `or` of two inverted half-bounds: `-(1<=ram<=3)` ≡ `ram<1 or ram>3`.

This split exists because **Scryfall sets no usable precedent to inherit**: its own numeric
negation is verified broken — `-pow>=8` parses successfully but filters _nothing_, confirmed live
against `api.scryfall.com`, returning the exact unfiltered total.

Origin: [Operator set and precedence](../../.scratch/query-language/issues/03-operator-set-and-precedence.md).

### 3.7 Deliberately absent

Decided explicitly, not omitted by accident:

- **Exact-name matching** — rejected. Card names carry uniqueness in an em-dash subtitle
  (`subname` is always null; the whole name is one string), so an "exact match" operator would
  require typing that exact punctuation — a bad failure mode, redundant besides with the slug
  route and substring search over an already-unique name space.
- **Wildcards** — rejected. The card set isn't big enough to warrant it, and this isn't even a
  deviation from Scryfall: Scryfall has no glob syntax either. Its answer to pattern matching is
  regex, not `*`/`?`.
- **Fuzzy matching / "did you mean"** — out of scope on the map (editor affordances), not this
  spec's call.
- **Regex** — _included_, scoped to the text field only (bare words, `name:`, `rules:`), via
  Scryfall's `/pattern/` delimiter. Not Magic-specific baggage. Safety mechanism: §8.

Origin: [Operator set and precedence](../../.scratch/query-language/issues/03-operator-set-and-precedence.md).

---

## 4. `Predicate` mapping

Every decision above maps onto the existing tree in `src/lib/filters/predicate.ts` via
parser-level desugaring, with **three additive-only extensions** — no leaf redesigned, no
existing behaviour changed:

```ts
export type Predicate =
	| { kind: 'all' }
	| { kind: 'and'; children: readonly Predicate[] }
	| { kind: 'or'; children: readonly Predicate[] }
	| { kind: 'not'; child: Predicate }
	| { kind: 'color'; values: readonly Color[] }
	| { kind: 'cardType'; values: readonly CardType[] }
	| { kind: 'keyword'; values: readonly Keyword[]; empty?: boolean } // + empty
	| { kind: 'classification'; values: readonly string[]; empty?: boolean } // + empty
	| { kind: 'eddiable'; value: boolean }
	| {
			kind: 'numeric';
			field: NumericField;
			min: number | null;
			max: number | null;
			includeNull: boolean;
	  }
	| {
			kind: 'text';
			query: string;
			mode?: 'substring' | 'regex'; // + mode, default 'substring'
			scope?: 'name' | 'rules' | 'both'; // + scope, default 'both'
			empty?: boolean; // + empty
	  }
	| { kind: 'ramBudget'; budget: ColorBudget }
	| { kind: 'set'; values: readonly string[] }
	| { kind: 'rarity'; values: readonly Rarity[] };
```

- **`numeric`, `ramBudget`, `color`, `cardType`, `eddiable`, `set`, `rarity`, and the four
  structural kinds need zero changes.** Ranges, both forms of negation, and `field:none`/`:has`
  for numerics are all already expressible via `min`/`max`/`includeNull`.
- **`text` needs `mode`, `scope`, and `empty`** — found across three separate tickets (§3.7's
  regex, §3.4's name/rules split, §3.5's rules-haystack-emptiness), each independent, each
  additive, each optional with a backward-compatible default.
- **`classification` and `keyword` need `empty`** — array emptiness (§3.5) has no small
  representation in the current tree; the only _technically_ possible expression today is an
  absurd conjunction of `not` over every known tag or keyword.

**On generalizing `empty` into one mechanism, rather than three per-leaf flags:** considered and
declined. A shared wrapper (e.g. `{ kind: 'empty', of: 'classification' | 'keyword' | 'text' }`)
would still need per-kind dispatch in the evaluator to know what "empty" means for each leaf, so
it buys no real simplification over three optional booleans — three similar fields, each read by
its own leaf's existing evaluator case, is simpler than a wrapper type that exists only to avoid
writing `empty?: boolean` three times.

The evaluator's `test()` function needs new cases threaded through, not new architecture: `text`
dispatches on `mode` (substring vs. a ReDoS-checked regex match, §8) and `scope` (which
haystack — name-only, rules-only, or the existing combined one) before falling back to `empty`;
`classification`/`keyword` check `empty` before falling back to their existing `.some(...)` test.

---

## 5. Sort stays separate

`?sort=` is **completely unchanged** — same format (`cost-desc`), same absent-means-default
encoding, zero grammar changes, zero `Predicate` impact. Sort never enters `?q=`.

This is categorical, not a convenience: filtering narrows the result set, sorting only orders it
— a category mismatch with a grammar built around AND/OR/NOT over predicates. `-order:cost` and
`order:cost or order:name` have no sensible meaning, and the grammar was never obligated to admit
the question in the first place. Even Scryfall's own in-query `order:`/`direction:` keyword sits
atop a _separate_ authoritative `order`/`dir` param; novastack has one URL surface, not two, so
there's nothing for an equivalent convenience layer to buy.

Nulls-last stays fixed and non-configurable — not as a compromise, but because there is no
mechanism left through which someone could even attempt to ask for nulls-first, sort having never
entered the grammar.

Origin: [Does `?q=` absorb `?sort=`?](../../.scratch/query-language/issues/07-does-q-absorb-sort.md).

---

## 6. Error model

**Tolerant, not strict — inherited from stage 1 as non-negotiable, not reopened here.** What this
section decides is recovery granularity and observability.

**The parser returns `{ predicate, warnings }`, never a bare `Predicate`.** Each dropped unit
becomes a structured warning:

```ts
type ParseWarning = {
	text: string; // the raw source text of the dropped unit
	span: [start: number, end: number]; // position in the original query string
	reason:
		'unknown-field' | 'malformed-value' | 'unclosed-group' | 'invalid-regex' | 'inapplicable-field';
};

type ParseResult = { predicate: Predicate; warnings: readonly ParseWarning[] };
```

Mirrors Scryfall's own `data` + `warnings` response shape. The reason categories above are a
closed set synthesized from the decisions in §3 and §7 — `inapplicable-field` covers
`color:none` (§3.5), `invalid-regex` covers both outright bad syntax and a rejected ReDoS shape
(§8), `unclosed-group` covers the recovery unit below. Extending this set later is additive.

**Recovery unit: the smallest self-contained broken thing, never "everything after the first
error."** Matches Scryfall's own drop-the-clause-and-keep-going behaviour, extended to the one
case Scryfall hard-fails instead: an unclosed group. `t:legend (c:red or` drops the **entire
unclosed group** as one unit, keeping `t:legend`. Dropping everything from the first error onward
was rejected: one early typo in a long query would take out every later clause, including ones
with nothing wrong.

**Logical self-contradiction is not detected, and is not an error.** `t:legend t:unit` (a card
has exactly one type) is a real, meaningful query that happens to match nothing — not a parse
failure. Static satisfiability analysis is out of scope for a parser.

**Deliberately supersedes stage 1's own tested behaviour**, not a mere continuation of it:
`?color=chartreuse&cost=banana` degrading to all 133 cards with zero signal was itself an
instance of the "silent no-op, unflagged" anti-pattern found in Scryfall's own numeric-negation
bug — just at the URL-param layer. Whenever `warnings` is non-empty, **the UI must show
something** — exact wording and visual treatment belong to the follow-on editor map, but the data
existing at all, and being shown, is this spec's commitment. This applies identically whether the
query came from a keystroke or from loading someone else's shared link: a recipient of
`?q=t:legend c:chartreuse` must be able to tell they're seeing a wider result than the sender saw.

Origin: [Error model — tolerant or strict, and how errors surface](../../.scratch/query-language/issues/10-error-model.md).

---

## 7. URL and state

Replaces stage 1's §6 wholesale for filtering; sort (§5) is untouched.

```
page.url.searchParams.get('q') → parse → { predicate, warnings } → evaluate(dataset, predicate)
```

`?q=` is the **only filter param.** A cleared query is an absent param, exactly as stage 1's
per-facet params were — never an empty one. Shallow routing, the `currentUrl()` read (`page.url`
does not update under shallow navigation — read via `page.shallow.url`), and the ~250 ms search
debounce are all inherited unchanged from stage 1's §6, for the same reasons stated there.

**Parse cost is not a budget concern, at any query length realistically typed.** The debounce
exists to throttle DOM/derived-state updates, not because parsing is slow — see §8. "No
memoization, revisit only with a measurement" carries over unchanged.

### 7.1 URL-length sanity check

A deliberately elaborate worked query, well past what a real user would type:

```
t:legend (c:red or c:blue) -k:blocker legends:r2y4 rules:"rival unit"
```

72 characters unencoded. Percent-encoding the quoted phrase's space adds a handful of characters;
the rest of the grammar (`: ( ) - <space>`) needs no encoding at all in a query string. Even
several such clauses chained together stays comfortably under 300 characters — nowhere near the
~2000-character practical ceiling shared links (browsers, chat apps, `<a href>`) are conventionally
built around. **No length constraint is needed anywhere in the grammar or the parser.** Revisit
only if real usage ever produces queries this analysis didn't anticipate.

---

## 8. Parser approach and safety

**Hand-rolled recursive descent. No new runtime dependency.**

The grammar in §2 is genuinely small — a lexer, a precedence-climbing parser, and an
AST-to-`Predicate` compiler come to roughly 400–600 lines of plain TypeScript. Candidates were
checked against real numbers, not assumed: Parsimmon (56 KB unpacked) is workable on size but its
combinator ergonomics commonly need a cast at composition seams, risking the no-coercion
constraint directly; Chevrotain (1.24 MB unpacked) and a linear-time regex engine such as an RE2
binding (870 KB unpacked) are both disqualified on size alone. Valibot, already a runtime
dependency, parses _values_, not _grammar_ — it validates the leaves a hand-written parser
produces; it does not tokenize a string against a recursive grammar, which is a different
abstraction, not a harder version of the same one.

**Error recovery (§6) is the deciding factor, independent of size.** Per-clause and
per-unclosed-group recovery is natural as explicit control flow in a hand-written descent parser
(catch at a boundary, record what was dropped, resume) and awkward through opaque combinators or
a generated parse table, both tuned for "matches or doesn't," not "here's what was salvaged."

**Parse cost per keystroke is not a real budget concern**, regardless of approach: realistic
queries are short (§7.1) against a dozen-production grammar, and hand-rolled recursive descent
over input that size runs in microseconds to low-single-digit milliseconds.

**Regex safety.** The threat model is narrower than typical ReDoS advice assumes: this is one
person, in their own tab, against a corpus of 133 cards whose rules-text strings run roughly
100–250 characters each — not a server evaluating untrusted input from many other people.
Mitigation: **reject patterns matching known ReDoS shapes** (nested/overlapping quantifiers such
as `(a+)+`, `(a*)*`, overlapping alternation) via a static check before compiling, plus
**mandatory `try/catch`** around `new RegExp(...)` for outright invalid syntax — the latter is
required anyway, independent of ReDoS, since §6 already requires malformed regex to degrade as a
dropped clause. A linear-time engine or a Worker-plus-timeout were both considered and rejected as
disproportionate to a self-contained, own-tab risk.

Origin: [Parser approach and dependency budget](../../.scratch/query-language/issues/11-parser-approach-and-dependency-budget.md).

---

## 9. Chip behaviour

The language is a **superset of the chips** — chips → query always works; query → chips
sometimes cannot (`(t:legend or c:red) -k:blocker` has no chip rendering at all). This is the
_common_ case once the language does its job, not a rare edge case: `cost:none` alone, `tag:none`,
regex mode, and an odd `legends:` RAM number all already exceed the chips with no `or`/`not`
required.

**Representability is checked per facet, not per query.** For each facet independently: does the
tree contain exactly one top-level leaf of that facet's kind, with no enclosing `or`/`not`, in a
configuration the facet's actual control can produce? Facets that pass stay live and fully
interactive, unchanged from stage 1. Facets that fail go **read-only**, not hidden and not
disabled outright — visually distinguishable from an interactive chip, per §6's observability
principle.

**Rewriting the query on touch is rejected outright**, not weighed as a UX tradeoff — a
correctness hazard against a round-trip guarantee someone will rely on. Read-only is what
preserves it: an inert chip can never modify anything, so chips → query stays losslessly
guaranteed in every case, while query → chips stays honestly best-effort and visibly stops being
two-way exactly when it stops being lossless.

The panel **collapses entirely by default** behind one toggle — the query box is the primary
input — with the exception of density (cards-per-row), which stays always visible. This
supersedes stage 1's §8.2 Row 1 / Row 2 disclosure.

Origin: [Chip behaviour when a query exceeds them](../../.scratch/query-language/issues/09-chips-when-a-query-exceeds-them.md).

---

## 10. Migration

Two problems, genuinely different urgency:

**The 133 self-generated internal links (rules-text keyword/tag links, classification links) must
be regenerated in the same change that ships `?q=`.** Not a "defer until users" question — these
are baked into the same prerendered build, so an unmigrated href-generation path would mean the
site linking to itself with a scheme that no longer works, on day one, guaranteed. Mechanical
given §3's slug-form finding: keep emitting the existing `slugifyValue`-computed slug, just inside
`?q=tag:X` instead of `?tags=X`.

**No compatibility layer for external old-style links** — explicit and revisitable, not an
oversight. The site has no users yet, so there is no real population of old-style links to
protect today; the old scheme stays fully documented (stage 1's spec, the wayfinder map, git
history) so nothing about building a translator _later_ gets harder by waiting. Needs **zero new
code**: an old-style `?color=red&cost=2-4` is simply an unrecognised param once the parser only
looks for `q`, and §6's inherited "malformed/unrecognised input degrades" rule already covers it
— the same mechanism as any other unrecognised query string, not bespoke migration logic. Worst
case for a stray old link: a wider grid than expected, not an error page.

Origin: [Migration — do stage-1 URLs survive?](../../.scratch/query-language/issues/08-migration-do-old-links-survive.md).

---

## 11. The Syntax page

**Own route, `/syntax`**, not a nav item — linked inline next to the query box (the moment
someone is actually confused) and from the footer (a general, always-available path). Nav stays
reserved for real destinations. Prerendered like every other route.

**Two independent anti-drift mechanisms:**

- The operator table, field vocabulary, and alias list **render from the parser's own
  constants** — whatever field-keyword source of truth the hand-rolled parser (§8) produces —
  never a separately hand-maintained list.
- Every worked example on the page is a **test asserting it actually parses** (and, where
  meaningful, what it parses to) — catches an example that stops working even if the prose around
  it doesn't change.

These catch different failure modes: a generated table catches missing vocabulary; a tested
example catches a documented query that quietly breaks. Neither replaces the other.

**Worked examples are live links into `/cards?q=…`**, not static code snippets — near-zero cost,
since every example already is a URL, and clicking through to real results teaches faster than
reading a description of what a query does.

**Null semantics (§3.5) get their own section**, not folded row-by-row into the operator table —
the sharpest, least-intuitive corner of the language, and the one place with no Scryfall
equivalent to lean on for familiarity.

**Content is standalone — no Scryfall familiarity assumed.** "Like Scryfall, except…" was
rejected as a bet a Cyberpunk TCG fan site's audience can't be assumed to cover; the page teaches
the language on its own terms.

**Minimum content:** operator table (generated), field vocabulary with aliases (generated),
precedence (§2.2), null semantics (its own section, §3.5), worked examples (live links, tested).

Origin: [The Syntax page](../../.scratch/query-language/issues/12-the-syntax-page.md).

---

## 12. Deviations from Scryfall, and why

"We followed Scryfall" is the baseline a reader will assume; every departure is recorded here
rather than left to be discovered.

1. **Color is a scalar, not a set** — Scryfall's at-least/exactly color apparatus has nothing to
   bite on today. The `:`/`=` split is kept anyway, for a game where a future card could be
   multi-color (§3.1).
2. **The card-database map's `=`-as-AND / `:`-as-OR proposal is dropped.** It existed to buy
   intersection hunting, which implicit-AND plus `or` already delivers without overloading
   punctuation.
3. **The real `:`/`=` split is kept for Color and Card Type only**, not every field — following
   verified evidence that Scryfall itself doesn't extend exact-set semantics to its own nearest
   analogue (`keyword=`), rather than assuming symmetry (§3.1).
4. **Numeric negation is real and working**, where Scryfall's is verified broken (a silent
   no-op). Operator inversion, not inherited behaviour (§3.6).
5. **Exact-name matching is rejected** for a reason specific to this game's naming convention
   (the em-dash subtitle problem), not because Scryfall lacks the feature — it doesn't (§3.7).
6. **Wildcards are rejected** — not actually a deviation; Scryfall has no glob syntax either
   (§3.7).
7. **Regex is retained**, with a client-side ReDoS mitigation Scryfall, as a server, never needed
   (§8).
8. **`legends:` has no Scryfall analogue at all** — entirely novastack-original (§3.3).
9. **No in-query `order:` keyword.** Scryfall layers one atop an already-separate authoritative
   `order`/`dir` param; novastack has one URL surface, so the convenience layer buys nothing (§5).
10. **`field:none`/`field:has` are stricter and more explicit than anything Scryfall expresses** —
    novastack's "null is a distinct bucket, never zero" rule has no Scryfall equivalent (§3.5).
11. **`rules:`, not `o:`/oracle** — terminology, not semantics; a Scryfall-familiar reader would
    look for `o:` and should be told why it isn't there (§3.4).
12. **Error-recovery granularity extends Scryfall's own tier-2 behaviour to cover unclosed
    groups**, which Scryfall hard-fails as a 400 instead (§6).

---

## 13. Testing

Mirrors stage 1's own principle: shape the architecture so most of the risk sits in pure
functions.

| target                                                                                    | kind    |
| ----------------------------------------------------------------------------------------- | ------- |
| Lexer — every token kind, quoting/escaping, regex delimiter                               | unit    |
| Parser — one test group per production in §2, including precedence (`a or b c`)           | unit    |
| Error recovery — per-clause drop, unclosed-group drop, warnings shape                     | unit    |
| `legends:` tally/digit unification — every spelling of a given budget reduces identically | unit    |
| Negation splits — membership complement vs. operator inversion, including chained ranges  | unit    |
| `field:none`/`field:has`, including the composed-with-a-bound case                        | unit    |
| Per-facet chip representability check (§9)                                                | unit    |
| Regex ReDoS-shape rejection — known-dangerous patterns refused, benign patterns pass      | unit    |
| Generated operator/vocabulary tables match the parser's own constants                     | unit    |
| Syntax-page worked examples parse (and, where stated, parse to the claimed result)        | unit    |
| Typing a query → predicate updates → grid narrows → URL updates                           | browser |
| Read-only chip state when a query outgrows the panel                                      | browser |
| Live-link worked examples on `/syntax` navigate to the claimed results                    | browser |

---

## Open questions

Things a reader will reasonably ask that this spec does not answer — carried forward from the
wayfinder map's own fog, deliberately not foreclosed:

1. **Whether named or saved queries are wanted at all.** Adjacent, cheap once the language
   exists, and genuinely undecided either way.
2. **The stage-2 deckbuilder seam.** `evaluate` is dataset-scoped so a deck view can instantiate
   its own filter state; whether `?q=` means anything _inside_ a deck view is a question for that
   effort.

**Explicitly out of scope**, not open questions — ruled beyond this spec's destination, on the
map:

- **Editor affordances** — autocomplete, syntax highlighting, inline error markers, "did you
  mean." Reserved as the follow-on map; the error _model_ (§6) is in scope, its _presentation_ is
  not.
- **Parser implementation** — this is a spec. Writing the tokenizer, parser, and tests is the
  `/implement` job that follows.
- **Redesigning the `Predicate` tree** — it's the fixed target (§4).
- **The deckbuilder itself**, and **multi-game support** — unchanged from stage 1.
- **Query analytics** — no telemetry on what people search for.

---

## Provenance

| document                                                   | holds                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `docs/research/scryfall-syntax.md`                         | the primary-sourced Scryfall behaviour this language deliberately copies and deviates from  |
| `.scratch/query-language/map.md`                           | the wayfinder map this spec was assembled from                                              |
| `.scratch/query-language/issues/01-*.md` through `13-*.md` | one ticket per decision; every section above links its origin ticket                        |
| `docs/spec/card-database.md`                               | stage 1 — the dataset, images, `Predicate` tree, and everything this spec doesn't supersede |
| `CONTEXT.md`                                               | the domain glossary this spec's vocabulary follows without redefinition                     |
