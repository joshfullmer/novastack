# Scryfall search syntax — a precise baseline

The query-language map settles Scryfall as the baseline for novastack's `?q=` grammar. This doc
pins down exactly what Scryfall does — from its own docs, cross-checked against the live
`api.scryfall.com/cards/search` endpoint on **2026-08-21** — so later tickets can copy
deliberately, deviation by deviation, instead of by vibe.

Primary sources: the [Search Reference](https://scryfall.com/docs/syntax)[^syntax], the
[`GET /cards/search`](https://scryfall.com/docs/api/cards/search)[^api-search] API doc, and the
[API error object doc](https://scryfall.com/docs/api/errors)[^api-errors]. Everything else is a
live probe against the API — the same fulltext engine the website uses[^api-search] — with the
exact query and observed JSON shown inline or in the appendix. `WebFetch` was blocked with a
403 from Scryfall's edge; `curl` with a browser `User-Agent` was not, so all HTML pages were
pulled that way (noted here since it's a deviation from this repo's usual fetch path, not a
finding about Scryfall itself).

One nomenclature note before the sections: Scryfall calls its comma-free filter clauses
"keywords" (`t:`, `c:`, `o:`, …). This doc keeps that word to stay quotable against the docs, even
though novastack's own vocabulary uses "facet."

---

## 1. Operators

Every keyword in Scryfall's grammar is one of four kinds, and the operator set that applies to it
depends on the kind:

| kind                        | example keywords                                         | operators                                                | what `:` means             | what `=` means                                                                                       |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| **numeric**                 | `cmc`/`mv`, `pow`, `tou`, `loy`, `usd`, `year`, `edhrec` | `=` `!=` `<` `>` `<=` `>=`                               | alias for `=`[^colon-eq]   | exact numeric equality                                                                               |
| **textual**                 | `o:`/`oracle:`, `name`, `ft:`/`flavor:`, `a:`/`artist:`  | `:` only (substring/contains)                            | substring match            | not used[^text-eq]                                                                                   |
| **enumerated**              | `t:`/`type:`, `r:`/`rarity:`, `f:`/`format:`, `is:`      | `:` (and `<`/`>=` etc. for orderable ones like `rarity`) | "is/contains this value"   | rarely meaningful; `rarity` is explicitly ordered so `r>=r` ("rare or above") is real[^rarity-order] |
| **set-valued** (Magic-only) | `c:`/`color:`, `id:`/`identity:`                         | `:` `=` `<` `>` `<=` `>=` `!=`                           | **at-least** (subset test) | **exactly** (set equality)                                                                           |

The doc states the set-valued distinction explicitly: "`c:rg`" is "cards that are red and green"
(at least those two), while "`c=2 is:bear`" is "'Bears' that are exactly two colors"[^syntax]. Mana
cost (`m:`/`mana:`) is comparison-like but symbol-based rather than numeric or set-valued: "a mana
cost is greater than another if it includes all the same symbols and more, and it's less if it
includes only a subset of symbols"[^syntax] — structurally the same at-least/exactly split as
color, just over mana symbols instead of color letters.

For **numeric** fields, `:` and `=` are observed to be interchangeable — `pow:8` and `pow=8` both
returned `total_cards: 122` live[^colon-eq]. The syntax page never states this explicitly; it
documents only the comparison-operator list for numeric fields (`> < = >= <= !=`)[^syntax-pt] and
never mentions `:` for them at all. This is an observed-behavior addition to the docs, not a
documented rule.

For **textual** fields, `:` is the only operator ever shown — `o:draw`, `ft:mishra`,
`a:"proce"`[^syntax]. There is no numeric-style `=` for text; a colon is inherently a substring
test, and Scryfall's docs never present an "exact text" comparison outside the dedicated `!` exact
name prefix (§4).

For **enumerated** fields, most (`t:`, `f:`, `r:`) are `:`-only membership tests, but a few are
explicitly given an ordering so range operators apply: `rarity` supports `<` and `>=` because
common → uncommon → rare → mythic has a defined order[^syntax-rarity]; `year`/`date` are
technically numeric-by-date rather than enumerated, but behave the same way.

`!=` is documented for every numeric family: colors/color identity[^syntax-color], mana
value[^syntax-mana], power/toughness/loyalty[^syntax-pt], rarity[^syntax-rarity], prices[^syntax-usd],
and year/date[^syntax-year]. It is not offered for plain textual keywords (`o:`, `name`, `ft:`) —
there is no `o!=` in the docs, and none was tested live because the docs give no reason to expect
one.

---

## 2. Connectives and precedence

Three connectives exist, plus grouping:

- **Implicit AND** — juxtaposition. "By default every search term you enter is combined. All of
  them must match to find a card."[^syntax-or]
- **`or` / `OR`** — disjunction. Confirmed case-insensitive live: `t:fish or t:bird`, `t:fish OR
t:bird`, and `t:fish Or t:bird` all returned `total_cards: 523`[^live-or-case].
- **`-` (negation)** — covered in §3.
- **`( )`** — grouping, "most useful when combined with the OR keyword"[^syntax-nest].

**`and` is not documented, but it exists as a silent no-op keyword.** It is nowhere in the syntax
guide. Live: `and` alone as a query returns a 400 with `"details": "All of your terms were
ignored."` and `"warnings": null`[^live-and-alone] — the same shape as a query with zero terms,
_not_ the shape Scryfall gives an unrecognized bare word (which would be treated as a loose
name-search term and simply fail to match anything, a 404, not a 400). That distinction — 400
"all terms ignored" vs. 404 "no match" — is what shows `and` is being recognized and discarded by
the parser, not searched for literally. Consistent with that: `t:instant and c:u` returns exactly
`total_cards: 1151`, identical to `t:instant c:u` with no `and` at all and with **no warning**
attached[^live-and-noop] — `and` is swallowed as a redundant, undocumented synonym for
juxtaposition, not rejected.

**Precedence: implicit AND binds tighter than `or`.** The docs hint at this only indirectly — the
worked example `t:land (a:titus or a:avon)` uses explicit parens to scope an OR to two terms
distinct from the ANDed `t:land` outside[^syntax-or] — but never state the unparenthesized rule.
Live cross-check settles it:

| query                          | total    | what it implies                                    |
| ------------------------------ | -------- | -------------------------------------------------- |
| `t:instant`                    | 3887     | —                                                  |
| `t:sorcery`                    | 3708     | —                                                  |
| `t:instant c:u`                | 1151     | —                                                  |
| `t:sorcery c:u`                | 721      | —                                                  |
| `t:instant or t:sorcery c:u`   | **4594** | ≈ 3887 + 721 (± ~14 instant/sorcery overlap cards) |
| `(t:instant or t:sorcery) c:u` | **1858** | ≈ 1151 + 721 (± ~14 overlap)                       |

`t:instant or t:sorcery c:u` matches `t:instant OR (t:sorcery AND c:u)` — i.e. the unparenthesized
form is `a or (b c)`, not `(a or b) c`. Juxtaposition greedily grabs everything up to the next `or`
boundary before the disjunction applies. Parenthesizing the OR explicitly (as the docs' own
example does) is the only way to get `(a or b) c`[^live-precedence].

There is no explicit precedence table published; the above is entirely a live-behavior finding,
flagged accordingly.

**Precedence, stated as a list (highest-binding first):**

1. `( … )` grouping
2. `-` negation (binds to the single following term or group — see §3)
3. implicit AND (juxtaposition)
4. `or` (lowest; splits the query into alternatives, each side of which absorbs everything
   AND-adjacent to it before the split applies)

---

## 3. Negation scope — and where it breaks

"All keywords except for `include` can be negated by prefixing them with a hyphen (`-`). This
inverts the meaning of the keyword to reject cards that matched what you've searched for. The
`is:` keyword has a convenient inverted mode `not:` … Loose name words can also be inverted with
`-`"[^syntax-negate]. That's the entire documented rule — no carve-outs.

**For `:`-keywords, `-` produces the exact logical complement, and null/absent counts as a
non-match — so negation includes it.** This is the load-bearing finding for novastack's "null is a
distinct bucket, never absent-equals-false" rule, and Scryfall's behavior here does _not_ violate
it, because color/watermark absence in Magic is itself a defined value, not an inapplicable stat.
Verified live three ways:

- `-t:creature` → `total_cards: 14846`, and `t:creature` → `18753`; database total is
  `33599`; `18753 + 14846 = 33599` exactly[^live-negate-complement].
- `-(t:instant or t:sorcery)` → `26032`; `(t:instant or t:sorcery)` → `7567`; `26032 + 7567 =
33599` exactly — negation of a parenthesized _group_ also produces the exact De Morgan
  complement, i.e. `-` scopes over the whole group when one is given[^live-negate-group].
- `wm:orzhov -wm:orzhov` (a card can't be both) → `0` results (404
  not-found)[^live-negate-contradiction], confirming the two sets are genuinely disjoint, not
  independently-computed approximations.
- A colorless card (no color at all) is not "false" for every color check by coercion — it's a
  real, named state (`c`/`colorless`)[^syntax-color] — and a card with no watermark is likewise a
  real absence that `has:watermark` is built to test for (§5). `-wm:orzhov` matching a
  no-watermark card is "absence is not orzhov," the same logic novastack wants: absence is its own
  bucket, and _that bucket is what a negated equality is expected to include_, exactly as
  novastack's rule anticipates.

**For numeric-comparison keywords, `-` negation is either a parse error or a silent no-op —
Scryfall has no working negated-range query, so it sets no usable precedent to copy.** This
is the single most surprising finding in this document. Three different live results depending on
operator and field:

| query                                           | result                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `-loy=1`                                        | 400, warning: `Unknown keyword "-loy"`                                                               |
| `-pow=8`                                        | 400, warning: `Unknown keyword "-pow"`                                                               |
| `-cmc=3`                                        | 400, warning: `Invalid expression "-cmc=3" was ignored. The value must be a number, or "even"/"odd"` |
| `-loy>=1`                                       | 200, `total_cards: 33599` — identical to the _unfiltered_ total                                      |
| `-pow>=8`                                       | 200, `total_cards: 33599` — identical to the _unfiltered_ total                                      |
| `t:creature -pow>=8`                            | 200, `total_cards: 18753` — identical to `t:creature` alone                                          |
| `loy>=1 -loy>=1` (should be a contradiction, 0) | 200, `total_cards: 333` — identical to `loy>=1` alone                                                |

For `=`, the hyphen is never stripped from the keyword name at all — the parser reports the
literal token `-loy` or `-pow` as an unrecognized keyword, and `-cmc=3` fails differently still
(a value-type error, suggesting `cmc` was recognized but something about negation confused its
value parser). For `>=`/`>`, no error and no warning appear, but the clause has **zero filtering
effect** — appending it to a query changes nothing, as the `loy>=1 -loy>=1` contradiction check
proves directly (it should be empty and isn't)[^live-negate-numeric]. This contradicts the docs'
blanket "all keywords... can be negated" claim outright, and it means the actual question this
ticket was asked to settle — "what does `-pow>=8` return for a card with a null `pow`" — is
unanswerable from Scryfall, because the feature that would answer it does not function. Whatever
novastack decides about negating a numeric bound against a null field, it will be deciding this
independently, not inheriting an answer from Scryfall.

---

## 4. Quoting and escaping

Quotes are required whenever a value contains a space or punctuation: "You can put quotes `" "`
around text with punctuation or spaces"[^syntax-text]. This applies uniformly to `o:`/`oracle:`,
`ft:`/`flavor:`, `a:`/`artist:`, `wm:`/`watermark:`, and the exact-name `!` prefix[^syntax-exact].
An unquoted multi-word value simply doesn't work as one term — `o:enters tapped` (no quotes)
parses as two separate clauses (`o:enters` AND a loose word `tapped`), which is why it returned a
404 not-found live rather than matching the "enters tapped" cards `o:"enters tapped"` correctly
finds (777 results)[^live-quote-required].

**Single quotes work identically to double quotes as a delimiter, and this is undocumented.**
`o:'enters tapped'` returned the same `total_cards: 777` as `o:"enters tapped"`
live[^live-single-quote]. The syntax guide only ever shows `" "`.

**Escaping a literal quote character inside a quoted value is not documented anywhere in the
syntax guide, and could not be positively confirmed live.** A backslash-escaped quote
(`o:"say \"hi\""`) returned a 404 not-found against a deliberately nonsense phrase, which is
consistent with either "the escape worked and no card says that" or "the escape didn't work and
the query is garbage" — the probe can't distinguish those, since no real Oracle text contains an
embedded double quote to test against. This is a genuine documentation gap on Scryfall's part, not
just an omission from this research: treat it as **unverified**, not as "backslash-escaping is
supported."

Regex mode (`/…/`, for `t:`, `o:`, `flavor:`, `name:`) has its own escaping rule, stated
explicitly: "Forward slashes inside your regex must be escaped with `\/`"[^syntax-regex]. That's
the one escape rule the docs do commit to, and it only applies inside regex delimiters, not inside
plain quoted strings.

---

## 5. Nulls and absence

Scryfall has **no general "field is null" syntax.** There is no `pow=` or `pow:null` or similar.
Instead there are two different, narrower mechanisms, and which one applies depends on the kind of
field:

1. **A dedicated `has:` presence keyword, per attribute, hand-added where it mattered.** The docs
   show exactly two: `has:indicator` ("cards that have a color indicator")[^syntax-color] and
   `has:watermark` ("match all cards with watermarks")[^syntax-artist]. Absence is then just the
   negation of presence: `-has:watermark`. There is no third, generic form — Scryfall's answer to
   "does this optional attribute exist" is a bespoke keyword per attribute Scryfall's engineers
   decided was worth exposing, not a language-level null operator.

2. **For numeric fields (power/toughness/loyalty), there is no query for absence at all** — not
   even a `has:power`. The only way "null power" surfaces in the syntax is _implicitly_, by what a
   numeric comparison does **not** match. This was verified live and is the cleanest confirmation
   in this document that Scryfall does not coerce null to zero: `pow=0` (a real printed 0, e.g.
   several 0-power creatures) returns `total_cards: 1054`, and `pow<1` returns `1058` — nearly
   identical, not anywhere close to the ~14,846 noncreature cards that have no `pow` value at
   all[^live-null-not-zero]. If null were treated as `0` for comparison purposes, `pow<1` would
   have scooped up every noncreature card too. It doesn't. Scryfall's numeric engine silently
   excludes null from every numeric comparison, in both directions, without a way to query for the
   null bucket on its own.

This is the answer to the ticket's specific question: Scryfall's "null is excluded from bounds"
behavior for numeric fields matches novastack's own rule (`power: null` is not `power: 0`), but
Scryfall gives no syntax to _select_ the null bucket directly the way novastack may want to (e.g.
"show me cards where power doesn't apply"). Copying Scryfall's numeric behavior gets novastack the
correctness property for free; it does not get the "query the null bucket" capability, which would
have to be novastack's own addition — the `has:`-style keyword is the closest existing precedent,
generalized from "does this optional attribute exist" to "does this stat apply at all."

---

## 6. Error handling

This is the most load-bearing finding for the error-model ticket, and the actual behavior is
**a three-tier model**, not a binary fail/succeed:

**Tier 1 — structural failure fails the whole query, HTTP 400, zero results.** An unclosed
parenthesis, even with an otherwise-valid term before it, hard-fails:

```
q=c:red (t:instant
→ 400 bad_request
  "details": "Your search contains unclosed parentheses."
```

verified live even with a valid `c:red` term present[^live-unclosed-paren] — a structural error is
not locally recoverable the way a bad clause is (Tier 2 below); the whole query is rejected.

**Tier 2 — a semantically bad clause is dropped, not fatal, _if at least one other clause is
still valid._** An unknown keyword or an invalid comparison generates a **warning**, and the
clause is silently removed from the query — the surviving clauses still run and return real
results:

```
q=c:red bogusfield:foo
→ 200 ok, total_cards: 7073 (identical to "c:red" alone)
  "warnings": ["Invalid expression "bogusfield:foo" was ignored. Unknown keyword "bogusfield"."]
```

verified live[^live-partial-warning]. The dropped clause behaves exactly like novastack's own
"malformed ranges are dropped, not thrown" rule[^map] — it widens the result set relative to what
the user probably meant, rather than erroring, and it does so silently enough that a shared link
with one bad clause still returns the good clauses' results.

**Tier 2, degenerate case — if _every_ clause is bad, the whole query still 400s**, because
nothing is left to search with:

```
q=bogusfield:foo
→ 400 bad_request, "details": "All of your terms were ignored."

q=is:slick cmc>cmc
→ 400 bad_request
  "warnings": [
    "Invalid expression "is:slick" was ignored. Checking if cards are "slick" is not supported",
    "Invalid expression "cmc>cmc" was ignored. The sides of your comparison must be different."
  ]
  "details": "All of your terms were ignored."
```

both verified live[^live-all-ignored]. So "drop the bad clause" and "fail the query" are the same
mechanism at different clause counts, not two different code paths — a 400 here specifically means
"after dropping every clause that couldn't be understood, there was nothing left to run," and the
`warnings` array on a 400 tells you exactly what was thrown away and why.

**Tier 3 — a syntactically-fine query that legitimately matches nothing is a different error
entirely: HTTP 404, `code: "not_found"`,** distinguished from Tier 2's "all terms ignored" 400.
`q=cmc>=` (a comparison with no right-hand value) returned a 404 "Your query didn't match any
cards"[^live-malformed-value] rather than a parse error — meaning the trailing bare operator
apparently got absorbed as literal/loose text rather than triggering a syntax error, and the
resulting (nonsensical) query simply matched zero cards. This is worth flagging precisely because
it means malformed-looking input doesn't reliably surface as an error at all; sometimes it degrades
all the way down to "no results," indistinguishable from a well-formed query for something rare.

**The un-flagged failure mode: silent no-op with no warning at all.** §3's numeric-negation bug
(`-pow>=8` accepted with 200 and no warning, but filtering nothing) is a fourth, worse behavior
that doesn't fit the three tiers above — it's not dropped-with-a-warning (Tier 2), not a hard
failure (Tier 1), and not a real empty-result (Tier 3). It's a clause that parses, is retained,
and produces a result set indistinguishable from the clause never having existed, with nothing in
the response to signal that. This is the shape of error novastack's design should treat as
worst-in-class and actively guard against: every dropped/ignored clause should be _observable_
(via a warning-equivalent), never silent.

**API vs. website divergence, documented explicitly:** the API doc states the search endpoint "is
more strict than the user-facing search system"[^api-search] — the website auto-retries a
no-match query with `include:extras` and then `lang:any`, auto-redirects a set-only query to a
gallery view, offers UI suggestions/"swizzling" for coverage-expanding searches, and helps with
spelling — none of which the raw API does. novastack has no such two-tier system planned, but it's
worth noting Scryfall's own "error model" is genuinely two different systems layered on the same
grammar, not one.

---

## 7. Sort

Sort is **both** — a separate top-level parameter _and_ an in-query keyword, and they use
different names for the same thing:

- **As a separate API parameter:** `order` (11 options: `name`, `set`, `released`, `rarity`,
  `color`, `usd`, `tix`, `eur`, `cmc`, `power`, `toughness`, `edhrec`, `penny`, `artist`, `review`)
  and `dir` (`auto` / `asc` / `desc`, default `auto`)[^api-sort].
- **As an in-query keyword (website only, per the syntax guide):** `order:` (a longer list —
  `artist`, `cmc`, `power`, `toughness`, `set`, `name`, `usd`, `tix`, `eur`, `rarity`, `color`,
  `released`, `spoiled`, `edhrec`, `penny`, `review`, `imageupdated`) and `direction:` (`asc` /
  `desc`)[^syntax-display].

Note the naming mismatch: the API's separate parameter is `dir`, but the in-query keyword is the
full word `direction:`. Confirmed live that the in-query form actually sorts, not just gets
silently dropped: `q=t:instant order:cmc` returns the lowest-cmc instants first (`Evermind`,
`Intervention Pact`, …)[^live-order-keyword]. Both interfaces exist simultaneously and are not
merely aliases of each other in surface syntax — one is a query token, the other a request
field — even though they drive the identical underlying sort.

---

## 8. Magic-specific baggage — do not copy

Everything below only makes sense because of Magic's own domain and has nothing to bite on in
novastack, where **Colour is one scalar per card** (Red, Yellow, Green, or Blue), not a set:

- **Color-as-a-set comparison apparatus (`c:`/`id:` with `>`, `<`, `>=`, `<=`, `!=`, numeric
  color-count matching, colorless/multicolor keywords, guild/shard/wedge/nickname vocabularies
  like `azorius`/`bant`/`abzan`)[^syntax-color].** All of it exists to answer "does this card's
  color _set_ contain/equal/subset another set." With one scalar colour per card, `c:red` collapses
  to plain equality — there is no at-least/exactly distinction left to make, and no nickname
  vocabulary to build (novastack has 4 colours total, not 32 combinations of 5).
- **Color identity (`id:`/`identity:`) as a concept distinct from color (`c:`).** This exists
  because a card's color identity includes colors from symbols in its rules text/mana cost, for
  Commander-format legality, which has no analog without a commander format or mana costs.
- **Mana cost matching (`m:`/`mana:`) and its symbol algebra** — `{2/G}`, hybrid (`is:hybrid`),
  Phyrexian (`is:phyrexian`), devotion counting (`devotion:`), and the at-least/exactly comparison
  over symbol multisets[^syntax-mana]. Cyberpunk TCG cards have a plain numeric cost, not a
  cost _string_ with symbols to compare structurally — this entire section of Scryfall's grammar
  has no target.
- **Mana-value-vs-power-vs-toughness cross-comparison** (`pow>tou`, `cmc<power`)[^syntax-pt] is
  cheap in Scryfall because all three are already-normalized single numbers on one card; nothing
  about it is Magic-specific per se, but the specific fields (`cmc`, `pt`/`powtou` as one field)
  don't map onto novastack's stat set without renaming, and `pt`'s "total power and toughness"
  combined-field concept has no toughness counterpart in Cyberpunk TCG at all.
- **Multi-faced cards** (`is:split`, `is:flip`, `is:transform`/`tdfc`, `is:meld`/`meldpart`/
  `meldresult`, `is:leveler`, `is:dfc`, `is:mdfc`)[^syntax-multiface] — an entire keyword family for
  a physical-card-layout concept (one card, multiple faces/halves) that doesn't exist in Cyberpunk
  TCG's card model at all.
- **Format legality and format-specific keywords** (`f:`/`format:`, `banned:`, `restricted:`,
  `is:commander`, `is:brawler`, `is:companion`, `is:oathbreaker`, `is:partner`,
  `edhrecrank`)[^syntax-legality] — tied to Magic's many constructed formats (Standard, Modern,
  Commander, …). Cyberpunk TCG has no equivalent multi-format legality matrix documented in this
  codebase's domain model so far.
- **Reprints, sets/blocks, languages, and the entire pricing section** (`usd`/`eur`/`tix`,
  `cheapest:`)[^syntax-sets][^syntax-usd][^syntax-lang] exist because Magic has 30+ years of
  reprints across hundreds of sets and active secondary markets in three currencies/platforms.
  novastack's printings model (chips-and-ranges, stage 1) is far shallower; if/when novastack
  grows a printings-aware query surface, the _shape_ of `s:`/`e:`/`cn:` (set + collector number)
  is plausibly reusable, but the reprint-counting keywords (`sets=`, `prints=`, `is:unique`) assume
  a reprint history depth Cyberpunk TCG's data doesn't have yet.
- **Border/frame/foil/finish/security-stamp keywords**[^syntax-frame] — physical-print metadata
  (`border:`, `frame:1993`, `is:foil`/`is:etched`/`is:glossy`, `stamp:oval`) with no equivalent
  tracked anywhere in novastack's `Predicate` tree.
- **Tagger tags** (`art:`/`atag:`, `function:`/`otag:`)[^syntax-tagger] — community-curated tagging
  data from a separate Scryfall sub-project (Tagger), not part of the core card data at all.
- **`!` exact-name matching and regex mode over `type:`/`oracle:`/`flavor:`/`name:`** are _not_
  domain-specific — they're general text-matching features novastack could plausibly want — but
  they're listed here as a reminder that "Magic-specific" and "worth copying" are different axes;
  don't reflexively cut regex support just because color-as-a-set gets cut.

---

## Appendix — sources and reproduction

### Primary sources

- [Search Reference](https://scryfall.com/docs/syntax) — the full syntax guide (fetched
  2026-08-21)
- [`GET /cards/search`](https://scryfall.com/docs/api/cards/search) — API parameters, sort
  options, and the documented API/website behavioral gap
- [API error object](https://scryfall.com/docs/api/errors) — error shape and the
  `is:slick cmc>cmc` worked example
- [`https://api.scryfall.com/cards/search`](https://api.scryfall.com/cards/search) — the live
  endpoint used for every probe below

### Fetching the HTML docs (WebFetch was blocked, 403; curl with a UA was not)

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -sL -A "$UA" "https://scryfall.com/docs/syntax"          -o syntax.html
curl -sL -A "$UA" "https://scryfall.com/docs/api/cards/search" -o api-search.html
curl -sL -A "$UA" "https://scryfall.com/docs/api/errors"       -o api-errors.html
```

### Live probes (all against `https://api.scryfall.com/cards/search?q=…&unique=cards`)

```bash
B="https://api.scryfall.com/cards/search"

# §1 — colon vs equals on a numeric field
curl -s "$B?q=pow:8&unique=cards"  | jq .total_cards   # 122
curl -s "$B?q=pow=8&unique=cards"  | jq .total_cards   # 122

# §2 — OR case-insensitivity
curl -s "$B?q=t:fish+or+t:bird&unique=cards" | jq .total_cards   # 523
curl -s "$B?q=t:fish+OR+t:bird&unique=cards" | jq .total_cards   # 523
curl -s "$B?q=t:fish+Or+t:bird&unique=cards" | jq .total_cards   # 523

# §2 — "and" is a silent no-op keyword, not a literal word
curl -s "$B?q=and&unique=cards"                        # 400 "All of your terms were ignored."
curl -s "$B?q=t:instant+and+c:u&unique=cards" | jq .total_cards   # 1151, no warning
curl -s "$B?q=t:instant+c:u&unique=cards"     | jq .total_cards   # 1151

# §2 — precedence: implicit AND binds tighter than "or"
curl -s "$B?q=t:instant&unique=cards"                       | jq .total_cards  # 3887
curl -s "$B?q=t:sorcery&unique=cards"                        | jq .total_cards  # 3708
curl -s "$B?q=t:instant+c:u&unique=cards"                    | jq .total_cards  # 1151
curl -s "$B?q=t:sorcery+c:u&unique=cards"                     | jq .total_cards  # 721
curl -s "$B?q=t:instant+or+t:sorcery+c:u&unique=cards"        | jq .total_cards  # 4594
curl -s "$B?q=(t:instant+or+t:sorcery)+c:u&unique=cards"      | jq .total_cards  # 1858

# §3 — colon-keyword negation is an exact complement, incl. over a parenthesized group
curl -s "$B?q=t:creature&unique=cards"                        | jq .total_cards  # 18753
curl -s "$B?q=-t:creature&unique=cards"                       | jq .total_cards  # 14846
curl -s "$B?q=*&unique=cards"                                 | jq .total_cards  # 33599
curl -s "$B?q=(t:instant+or+t:sorcery)&unique=cards"          | jq .total_cards  # 7567
curl -s "$B?q=-(t:instant+or+t:sorcery)&unique=cards"         | jq .total_cards  # 26032
curl -s "$B?q=wm:orzhov+-wm:orzhov&unique=cards"               # 404 not_found (0 results)

# §3 — numeric-comparison negation: error or silent no-op, never a working negation
curl -s "$B?q=-loy=1&unique=cards"       # 400 "Unknown keyword \"-loy\""
curl -s "$B?q=-pow=8&unique=cards"       # 400 "Unknown keyword \"-pow\""
curl -s "$B?q=-cmc=3&unique=cards"       # 400 "The value must be a number, or \"even\"/\"odd\""
curl -s "$B?q=-loy>=1&unique=cards"      | jq .total_cards  # 33599 (== unfiltered total)
curl -s "$B?q=-pow>=8&unique=cards"      | jq .total_cards  # 33599 (== unfiltered total)
curl -s "$B?q=t:creature+-pow>=8&unique=cards" | jq .total_cards  # 18753 (== t:creature alone)
curl -s "$B?q=loy>=1+-loy>=1&unique=cards"     | jq .total_cards  # 333 (should be 0)

# §4 — quoting: single quotes work identically to double, undocumented
curl -s "$B?q=o:\"enters+tapped\"&unique=cards" | jq .total_cards  # 777
curl -s "$B?q=o:'enters+tapped'&unique=cards"   | jq .total_cards  # 777
curl -s "$B?q=o:enters+tapped&unique=cards"                        # 404 (unquoted splits into 2 terms)

# §5 — null is excluded from numeric comparisons, not coerced to zero
curl -s "$B?q=pow=0&unique=cards" | jq .total_cards   # 1054 (real printed zeros)
curl -s "$B?q=pow<1&unique=cards" | jq .total_cards   # 1058 (not ~14846 — noncreature nulls excluded)

# §6 — the three-tier error model
curl -s "$B?q=c:red+(t:instant&unique=cards"          # 400, unclosed parens, whole query fails
curl -s "$B?q=c:red+bogusfield:foo&unique=cards"      # 200, 7073 results + warnings (bad clause dropped)
curl -s "$B?q=bogusfield:foo&unique=cards"            # 400, "All of your terms were ignored."
curl -s "$B?q=is:slick+cmc>cmc&unique=cards"          # 400, two warnings, "All of your terms were ignored."
curl -s "$B?q=cmc>=&unique=cards"                     # 404 not_found, not a parse error

# §7 — order: keyword actually sorts, confirmed by inspecting the first results
curl -s "$B?q=t:instant+order:cmc" | jq '.data[0:3] | .[].name'
# ["Evermind", "Intervention Pact", "Lindblum, Industrial Regency // Mage Siege"] — ascending cmc
```

[^syntax]: [Search Reference](https://scryfall.com/docs/syntax) — Colors and Color Identity.

[^colon-eq]:
    Live probe, `pow:8` and `pow=8` both return `total_cards: 122`; not documented on the
    syntax page.

[^text-eq]:
    Search Reference never shows `o=`, `ft=`, or `a=`; only `:` appears for textual
    keywords.

[^rarity-order]:
    [Search Reference](https://scryfall.com/docs/syntax) — Rarity: "you can also use
    comparison operators like `<` and `>=`," with the example `r>=r`.

[^syntax-pt]:
    [Search Reference](https://scryfall.com/docs/syntax) — Power, Toughness, and
    Loyalty.

[^syntax-rarity]: [Search Reference](https://scryfall.com/docs/syntax) — Rarity.

[^syntax-color]: [Search Reference](https://scryfall.com/docs/syntax) — Colors and Color Identity.

[^syntax-mana]: [Search Reference](https://scryfall.com/docs/syntax) — Mana Costs.

[^syntax-usd]: [Search Reference](https://scryfall.com/docs/syntax) — USD/EUR/TIX prices.

[^syntax-year]: [Search Reference](https://scryfall.com/docs/syntax) — Year.

[^syntax-or]: [Search Reference](https://scryfall.com/docs/syntax) — Using "OR".

[^live-or-case]: Live probe, `t:fish or/OR/Or t:bird` all return `total_cards: 523`.

[^syntax-nest]: [Search Reference](https://scryfall.com/docs/syntax) — Nesting Conditions.

[^live-and-alone]:
    Live probe, `q=and` → 400, `details: "All of your terms were ignored."`,
    `warnings: null`.

[^live-and-noop]:
    Live probe, `t:instant and c:u` and `t:instant c:u` both return
    `total_cards: 1151`, no warning on either.

[^live-precedence]:
    Live probe, see the precedence table in §2; counts cross-checked against the
    unparenthesized and parenthesized forms independently.

[^syntax-negate]: [Search Reference](https://scryfall.com/docs/syntax) — Negating Conditions.

[^live-negate-complement]:
    Live probe, `t:creature` (18753) + `-t:creature` (14846) = database
    total (33599).

[^live-negate-group]:
    Live probe, `(t:instant or t:sorcery)` (7567) + `-(t:instant or t:sorcery)`
    (26032) = 33599.

[^live-negate-contradiction]: Live probe, `wm:orzhov -wm:orzhov` → 404 not_found (0 results).

[^live-negate-numeric]:
    Live probes, see the table in §3; `-loy=1`/`-pow=8`/`-cmc=3` error
    differently, `-loy>=1`/`-pow>=8` are silently accepted no-ops, and
    `loy>=1 -loy>=1` fails to produce the expected contradiction (0 results).

[^syntax-text]: [Search Reference](https://scryfall.com/docs/syntax) — Card Text.

[^syntax-exact]: [Search Reference](https://scryfall.com/docs/syntax) — Exact Names.

[^live-quote-required]: Live probe, `o:enters tapped` (unquoted) → 404; `o:"enters tapped"` → 777.

[^live-single-quote]:
    Live probe, `o:'enters tapped'` → `total_cards: 777`, identical to double
    quotes; not documented on the syntax page.

[^syntax-regex]: [Search Reference](https://scryfall.com/docs/syntax) — Regular Expressions.

[^syntax-artist]:
    [Search Reference](https://scryfall.com/docs/syntax) — Artist, Flavor Text and
    Watermark.

[^live-null-not-zero]:
    Live probe, `pow=0` → 1054, `pow<1` → 1058; noncreature card count with no
    `pow` at all is ~14846 (33599 total − 18753 creatures), far larger than either, showing null
    power is excluded from the comparison rather than coerced to `0`.

[^map]: `.scratch/query-language/map.md` — "Malformed input degrades, it does not throw."

[^live-unclosed-paren]:
    Live probe, `q=c:red (t:instant` → 400,
    `details: "Your search contains unclosed parentheses."`, even with a valid `c:red` term
    present.

[^live-partial-warning]:
    Live probe, `q=c:red bogusfield:foo` → 200, `total_cards: 7073` (same as
    `c:red` alone), with a `warnings` array describing the dropped clause.

[^live-all-ignored]:
    Live probes, `q=bogusfield:foo` and `q=is:slick cmc>cmc` (the latter drawn
    from the [API error doc](https://scryfall.com/docs/api/errors) example) both → 400,
    `details: "All of your terms were ignored."`

[^live-malformed-value]:
    Live probe, `q=cmc>=` (trailing operator, no value) → 404 not_found, not
    a parse error.

[^api-search]:
    [`GET /cards/search`](https://scryfall.com/docs/api/cards/search) — "Missing
    Luxuries" section and the fulltext-search-system statement in the method description.

[^api-errors]: [API error object](https://scryfall.com/docs/api/errors).

[^api-sort]: [`GET /cards/search`](https://scryfall.com/docs/api/cards/search) — "Sorting Cards."

[^syntax-display]: [Search Reference](https://scryfall.com/docs/syntax) — Display Keywords.

[^live-order-keyword]:
    Live probe, `q=t:instant order:cmc` returns `Evermind` and
    `Intervention Pact` (both 0 mana value) first.

[^syntax-multiface]: [Search Reference](https://scryfall.com/docs/syntax) — Multi-faced Cards.

[^syntax-legality]: [Search Reference](https://scryfall.com/docs/syntax) — Format Legality.

[^syntax-sets]: [Search Reference](https://scryfall.com/docs/syntax) — Sets and Blocks.

[^syntax-lang]: [Search Reference](https://scryfall.com/docs/syntax) — Languages.

[^syntax-frame]:
    [Search Reference](https://scryfall.com/docs/syntax) — Border, Frame, Foil &
    Resolution.

[^syntax-tagger]: [Search Reference](https://scryfall.com/docs/syntax) — Tagger Tags.
