# Facet cardinality audit — cyberpunk (131 cards)

Probed `https://api.netdeck.gg` on **2026-08-20**. All 131 cards fetched via the **detail**
endpoint (`/api/cards/cyberpunk/{slug}`, concurrency 16) so `printings[]` is populated —
131 cards, **385 printings**, matching `docs/netdeck-api-notes.md` §2 exactly.

Everything below is measured against that snapshot unless a line is explicitly marked
**inferred**. Query-param claims were verified by asserting `total` actually moved, with a
negative control on every param (notes §1: unknown params are silently ignored).

Companion to [`../netdeck-api-notes.md`](../netdeck-api-notes.md). That doc covers the API
surface and images; this one covers only _which fields discriminate_.

---

## 0. Verdict table

| field                         | distinct  | shape                      | verdict                                     |
| ----------------------------- | --------- | -------------------------- | ------------------------------------------- |
| `card_type`                   | 4         | 65 / 26 / 25 / 15          | ✅ **filter** — primary axis                |
| `color`                       | 4         | 35 / 32 / 32 / 32          | ✅ **filter** — near-perfectly balanced     |
| `classifications[]`           | 39        | long tail, 1.73 per card   | ✅ **filter** — best facet in the dataset   |
| printing `rarity`             | 9         | 143 / 89 / 66 / 41 / …     | ✅ **filter** — but read from `printings[]` |
| `cost`                        | 9 + null  | 1–9, unimodal at 3–5       | ✅ **filter** — as a range                  |
| `ram`                         | 6 + null  | 1–6, 75/131 are `2`        | ⚠️ **filter, low value** — 57% one value    |
| `power`                       | 13 + null | 0–15, null on all Programs | ⚠️ **filter with a type caveat**            |
| set code (printing)           | 12        | 143 / 121 / 18 / …         | ✅ **filter** — 2 real sets + 10 tiny       |
| `is_eddiable`                 | 2         | 66 / 65                    | ❌ **cut** — 97% redundant with `card_type` |
| rules_text `{Keyword}` markup | 9         | 75/131 cards carry ≥1      | ✅ **filter** — derived, not a field        |
| `artist`                      | 57 raw    | 31 artists on 1 card only  | ⚠️ **search only** — and it's dirty         |
| `rules_text`                  | 131/131   | median 107 chars, 14.6 KB  | ✅ **search only**                          |
| `legality`                    | **1**     | all `legal`                | ❌ **cut** — constant                       |
| `keywords[]`                  | **0**     | `[]` on all 131            | ❌ **cut** — never populated                |
| printing `finish`             | **1**     | `null` on all 385          | ❌ **cut** — never populated                |
| `subname`                     | **1**     | `null` on all 131          | ❌ **cut** — never populated                |
| `flavor_text`                 | **1**     | `null` on all 131          | ❌ **cut** — never populated                |
| `print_number`                | 123/131   | near-unique                | ❌ **cut as facet** — display/sort only     |
| `name` / `display_name`       | 131/131   | unique, and identical      | ✅ **search only**                          |

---

## 1. Field presence

**Every one of the 26 card keys is present on all 131 cards, and all 8 printing keys on all 385.** No key is ever _absent_. So for filter design there are only two states to handle —
a value or an explicit `null`. There is no third "field missing" case, and no need for
`in`/`hasOwnProperty` guards.

Four card fields and one printing field are declared but **never populated**:

| field          | value on every row | rows |
| -------------- | ------------------ | ---- |
| `keywords`     | `[]`               | 131  |
| `subname`      | `null`             | 131  |
| `flavor_text`  | `null`             | 131  |
| `legality`     | `"legal"`          | 131  |
| `finish` (pr.) | `null`             | 385  |

The notes flagged `finish` (§2 gotcha 4) and `legality`. **`keywords[]`, `subname` and
`flavor_text` are new findings** — all three are dead weight, and `keywords[]` in particular
is a trap because its name promises the single most useful facet a TCG can have. See §5.

`name` is byte-identical to `display_name` on **131/131**. 61 names contain the `—`
subtitle separator, but `subname` is `null` for all of them — the subtitle is baked into
`name` and never split out. Store one string, not three.

---

## 2. Scalar fields

### `card_type` — 4 values ✅ filter

| value   | cards |
| ------- | ----- |
| Unit    | 65    |
| Program | 26    |
| Legend  | 25    |
| Gear    | 15    |

The primary discriminator, and the field every numeric stat's meaning depends on (§3).
Server-side: `?type=Unit` → 65 ✅ (asserted; `?type=unit` → 0, so **case-sensitive**).

### `color` — 4 values ✅ filter

| value  | cards |
| ------ | ----- |
| Yellow | 35    |
| Blue   | 32    |
| Green  | 32    |
| Red    | 32    |

The most evenly distributed field in the dataset — a 26.7% / 24.4% split four ways. Ideal
facet: every selection removes ~75% of the results. Also spread evenly _within_ each type,
so `color` × `card_type` never produces an empty cell:

| card_type | Red | Blue | Green | Yellow |
| --------- | --- | ---- | ----- | ------ |
| Legend    | 6   | 7    | 7     | 5      |
| Unit      | 16  | 16   | 15    | 18     |
| Program   | 7   | 7    | 6     | 6      |
| Gear      | 3   | 2    | 4     | 6      |

`?color=Red` → 32 ✅. Case-sensitive (`color=red` → 0).

### `rarity` — 6 at card level, **9 at printing level** ✅ filter

| card-level (`card.rarity`) | cards | printing-level (`printings[].rarity`) | printings | cards with ≥1 |
| -------------------------- | ----- | ------------------------------------- | --------- | ------------- |
| Common                     | 51    | Common                                | 143       | 51            |
| Uncommon                   | 32    | Uncommon                              | 89        | **34**        |
| Rare                       | 27    | Rare                                  | 66        | 27            |
| Epic                       | 16    | Epic                                  | 41        | 16            |
| Secret                     | 4     | Nova Rare                             | 16        | **9**         |
| Nova Rare                  | 1     | **Iconic Legend**                     | 14        | 14            |
|                            |       | Secret                                | 8         | 4             |
|                            |       | **Iconic Other**                      | 4         | 4             |
|                            |       | **Iconic Secret**                     | 4         | 4             |

**Three rarities exist only at printing level** — `Iconic Legend`, `Iconic Other`,
`Iconic Secret` (22 printings, 22 cards) never appear as a flattened card value. A UI built
off `card.rarity` cannot express "show me the Iconics" at all, which is exactly the query a
collector wants. `Nova Rare` is similarly hidden: 1 card by the flattened copy, 9 by
printings.

`?rarity=` resolves **printing-level**, matching the "cards with ≥1" column on all 9 values
(including `rarity=Iconic Legend` → 14, which would be 0 if it were card-scoped). The notes'
`rarity=Rare → 27` is ambiguous because Rare happens to agree in both scopes; Uncommon
(32 vs 34) and Nova Rare (1 vs 9) disambiguate it.

### `legality` — 1 value ❌ cut

All 131 `legal`. Not even a real query param: `?legality=bogus` → **131**, i.e. ignored, not
filtered. Zero information today. Keep the column for when a ban list appears; ship no
control.

### `is_eddiable` — 2 values, ❌ cut

A 66/65 split looks like a perfect boolean facet. It is not — it's almost entirely a
restatement of `card_type`:

| card_type | n   | true  | false |
| --------- | --- | ----- | ----- |
| Legend    | 25  | 24    | 1     |
| Unit      | 65  | **1** | 64    |
| Program   | 26  | 26    | 0     |
| Gear      | 15  | 15    | 0     |

Programs and Gear are 100% eddiable, Legends 96%, Units 1.5%. **Given `card_type`,
`is_eddiable` is predictable for 129 of 131 cards (98.5%)** — the two exceptions are the one
non-eddiable Legend and the one eddiable Unit. A user who has already picked a type learns
nothing from this toggle, and `type=Unit&eddiable=true` → **1 result** is a dead-end UI.

Cut the control; keep the field for rules display. Server-side the param is **`eddiable`,
not `is_eddiable`** — `?eddiable=true` → 66 ✅, while `?is_eddiable=true` → 131 (ignored).

### `finish` — 1 value ❌ cut

`null` on all 385 printings, confirming notes §2 gotcha 4. Not a query param either
(`?finish=Bogus` → 131, ignored). Foil is not modelled anywhere in this API.

---

## 3. Numeric fields by `card_type`

This is the load-bearing table for filter design. `n` is cards in that type; `null` counts
explicit `null`s; `zero` counts real `0` values.

### `cost`

| card_type | n   | null   | zero | min | max | distinct | distribution                              |
| --------- | --- | ------ | ---- | --- | --- | -------- | ----------------------------------------- |
| Legend    | 25  | **17** | 0    | 5   | 9   | 4        | 5:4 6:2 7:1 9:1                           |
| Unit      | 65  | 0      | 0    | 2   | 9   | 8        | 2:6 3:14 4:15 5:14 6:8 7:5 8:2 9:1        |
| Program   | 26  | 0      | 0    | 1   | 6   | 6        | 1:7 2:6 3:7 4:2 5:3 6:1                   |
| Gear      | 15  | 0      | 0    | 1   | 6   | 6        | 1:3 2:5 3:3 4:2 5:1 6:1                   |
| **ALL**   | 131 | 17     | 0    | 1   | 9   | 9        | 1:10 2:17 3:24 4:19 5:22 6:12 7:6 8:2 9:2 |

### `power`

| card_type | n   | null   | zero | min | max | distinct | distribution                                               |
| --------- | --- | ------ | ---- | --- | --- | -------- | ---------------------------------------------------------- |
| Legend    | 25  | **17** | 1    | 0   | 9   | 5        | 0:1 6:2 7:2 8:2 9:1                                        |
| Unit      | 65  | 0      | 7    | 0   | 15  | 13       | 0:7 1:2 2:6 3:8 4:13 5:5 6:6 7:4 8:8 9:2 10:2 14:1 15:1    |
| Program   | 26  | **26** | 0    | —   | —   | 0        | _(no numeric values at all)_                               |
| Gear      | 15  | 0      | 1    | 0   | 4   | 5        | 0:1 1:3 2:6 3:4 4:1                                        |
| **ALL**   | 131 | 43     | 9    | 0   | 15  | 13       | 0:9 1:5 2:12 3:12 4:14 5:5 6:8 7:6 8:10 9:3 10:2 14:1 15:1 |

### `ram`

| card_type | n   | null | zero | min | max | distinct | distribution                |
| --------- | --- | ---- | ---- | --- | --- | -------- | --------------------------- |
| Legend    | 25  | 1    | 0    | 2   | 2   | **1**    | 2:24                        |
| Unit      | 65  | 0    | 0    | 1   | 6   | 6        | 1:12 2:38 3:8 4:5 5:1 6:1   |
| Program   | 26  | 0    | 0    | 1   | 4   | 4        | 1:8 2:7 3:7 4:4             |
| Gear      | 15  | 0    | 0    | 1   | 4   | 4        | 1:3 2:6 3:3 4:3             |
| **ALL**   | 131 | 1    | 0    | 1   | 6   | 6        | 1:23 2:75 3:18 4:12 5:1 6:1 |

### What this means

**1. Absent vs null vs zero is settled: never absent, sometimes `null`, and `0` is a real
distinct value.** All three keys exist on all 131 cards. `power: 0` occurs on 9 cards
(7 Units, 1 Gear, 1 Legend — Sasha Yakovleva); `cost: 0` and `ram: 0` occur **zero** times.
The server agrees: `?power=0` → **9**, and does _not_ include the 43 nulls. So a
`power ≥ 0` range slider silently drops 43 cards, and coercing `null → 0` would merge them
with 9 legitimately-0-power cards. Treat `null` as a separate "—" bucket, not as 0.

**2. `power` is structurally inapplicable to Programs — 26/26 null.** A power filter must
either exclude Programs from its result set or be hidden when Program is the selected type.
This is the single most important consequence for filter design: a naive `power: 1–15`
slider is a hidden `card_type != 'Program'` filter.

**3. Legends split cleanly in two.** 17 of 25 Legends have `cost: null` **and**
`power: null`; the other 8 have **both** — the correlation is perfect (8 both / 17 neither /
0 mixed). The 8 statted Legends are exactly the ones whose `rules_text` carries the
`{Go Solo}` keyword (Adam Smasher — Ender of Legends, Goro Takemura — Hands Unclean, Jackie
Welles — Mama's Favorite, Rogue Amendiares — Preem Solo, Royce — Psycho on the Edge, Sasha
Yakovleva — Won't Let You Down, V — Corporate Exile, V — StreetKid). `{Go Solo}` lets a
Legend be played as a Unit, so it needs a Unit's stats. **Inferred:** cost/power on a Legend
is present iff the Legend can be played as a Unit. Measured: `{Go Solo}` appears on 9 cards
and cost-bearing Legends number 8, so the correspondence is 8/9 with one `{Go Solo}` card
outside the Legend type — strong but not a law.

**4. `ram` is nearly constant for Legends** — 24 of 25 are `ram: 2`, the 25th is null. Zero
discriminating power within that type.

**5. `ram` is weak overall.** 75 of 131 cards (57%) are `ram: 2`, and 116 of 131 (89%) fall
in 1–3. `ram=5` and `ram=6` have **one card each**. Ship it as a compact 1–6 range if it's
cheap, but it will rarely narrow anything; don't spend UI on individual value checkboxes.

**6. The outlier to test against: `Rebecca — Having a Moment`.** A Legend with
`cost`, `power`, `ram`, **and `rules_text` all null**, `classifications: []`, rarity
`Nova Rare`, and both its printings in `PRM01`. It is the only card that is null on `ram`
and the only one with no rules text. It will break any code path that assumes a stat, a
classification, or a rules string exists. Use it as the fixture.

**Server-side numeric params — all newly verified, none in the notes' table:**
`?cost=3` → 24, `?power=4` → 14, `?ram=2` → 75 — each matching the measured distribution
exactly. All three are exact-match, not range. Out-of-range values return 0
(`?cost=99` → 0), so they're genuinely recognized; an empty value is ignored
(`?power=` → 131).

---

## 4. `classifications[]` — 39 values ✅ best facet in the dataset

226 total entries across 131 cards, **mean 1.73 per card**.

| arity | cards |
| ----- | ----- |
| 0     | 1     |
| 1     | 53    |
| 2     | 58    |
| 3     | 19    |

Max is 3. The single 0-arity card is `Rebecca — Having a Moment`.

| n   | classification | n   | classification | n   | classification |
| --- | -------------- | --- | -------------- | --- | -------------- |
| 25  | Ganger         | 6   | Mox            | 3   | Fixer          |
| 23  | Merc           | 6   | Nomad          | 3   | Medtech        |
| 17  | Arasaka        | 6   | Quickhack      | 3   | Techie         |
| 17  | Corpo          | 6   | Rocker         | 3   | Tyger Claws    |
| 11  | Cyberware      | 6   | Zetatech       | 2   | AI             |
| 11  | Netrunner      | 5   | Vehicle        | 2   | Doll           |
| 9   | Braindance     | 4   | Drone          | 2   | Mystic         |
| 8   | Maelstrom      | 4   | Militech       | 2   | Plan           |
| 8   | Valentino      | 4   | NCPD           | 1   | 6th Street     |
|     |                | 4   | Ripperdoc      | 1   | Animal         |
|     |                | 4   | Samurai        | 1   | Extreme        |
|     |                | 4   | Trauma Team    | 1   | Maine's Crew   |
|     |                | 4   | Voodoo Boys    | 1   | Netwatch       |
|     |                | 4   | Weapon         | 1   | Raffen Shiv    |
|     |                | 3   | Aldecado       | 1   | Scavenger      |

Textbook facet shape: a usable head (Ganger 19%, Merc 18%, Arasaka/Corpo 13%) and a long
tail. Nothing is near-uniform and nothing is near-unique — the 8 singletons are still
meaningful because they're multi-valued, so a singleton co-occurs with a head value rather
than isolating one card in a dead-end.

**The vocabulary is type-partitioned**, which matters for UI ordering:

| card_type | distinct classifications | notable                                   |
| --------- | ------------------------ | ----------------------------------------- |
| Unit      | 31                       | the broadest; owns Drone, Vehicle, Animal |
| Legend    | 19                       | factions only                             |
| Program   | 11                       | owns Braindance, Quickhack, Plan, Extreme |
| Gear      | 9                        | owns Cyberware, Weapon, Netwatch          |

Two distinct kinds of value are mixed into one array: **factions/affiliations**
(Arasaka, Merc, Ganger, Maelstrom, Voodoo Boys…) and **card subtypes** (Cyberware, Weapon,
Vehicle, Drone, Quickhack, Braindance). Splitting them into two controls would read better
than one 39-item list. **Inferred** — the API gives no marker distinguishing the two; the
split would have to be a hand-maintained list of ~10 subtype strings.

Server-side the param is **`classifications` (plural)** — `?classifications=Merc` → 23 ✅,
matching the measured count. `?classification=Merc` (singular) → 131, ignored.
`?classifications=Bogus` → 0, so it's recognized.

---

## 5. `keywords[]` — empty on all 131 ❌ cut the field, ✅ derive the facet

**`keywords[]` is `[]` on every single card.** 0 distinct values, 0 total entries, arity 0
for all 131 across all four types. The overlap question in the ticket ("do the two
vocabularies overlap") is therefore vacuous: **the intersection is empty because one side is
empty.** There is no keyword vocabulary in this API to overlap with `classifications`.

The API even has a working param for it — `?keywords=Bogus` → 0 (recognized, not ignored),
`?keywords=Blocker` → **0**. The filter works; there is simply nothing to match. This is the
worst failure mode in the dataset: a plausible-looking facet that returns 0 results forever
rather than erroring.

### The keywords are real — they live in `rules_text` as `{Brace}` markup

`rules_text` contains brace-delimited game keywords. **9 distinct tokens, on 75/131 cards:**

| token          | cards | occurrences |
| -------------- | ----- | ----------- |
| `{Play}`       | 22    | 22          |
| `{Spend}`      | 14    | 14          |
| `{Attack}`     | 13    | 13          |
| `{Blocker}`    | 13    | 16          |
| `{Quick}`      | 10    | 10          |
| `{Go Solo}`    | 9     | 9           |
| `{Defeated}`   | 7     | 7           |
| `{Call}`       | 5     | 5           |
| `{Adrenaline}` | 4     | 4           |

Coverage by type: Legend 20/25, Unit 42/65, Gear 7/15, Program 6/26.

**This is a better-shaped facet than most real fields** — 9 values, largest at 17% of cards,
no singletons, and it answers the questions players actually ask ("show me blockers"). It
must be **parsed out of `rules_text` at build time** into a real `keywords` array. Regex
`/\{([^}]+)\}/g`. Do not trust the API's own field.

Also present in `rules_text`: `€` (22 cards, the eddies currency) and `☆` (11 cards, Street
Cred) — glyphs to style, not facets. Plus one pair of curly quotes.

---

## 6. `rules_text` — ✅ search only

| statistic          | value                                       |
| ------------------ | ------------------------------------------- |
| distinct values    | **131 / 131** (zero cards share rules text) |
| null               | 1 (`Rebecca — Having a Moment`)             |
| min / median / max | 0 / 107 / 251 chars                         |
| mean               | 113.6 chars                                 |
| p25 / p75 / p90    | 77 / 144 / 172                              |
| whole corpus       | **14,957 bytes (14.6 KB)**                  |

| length bucket | cards |
| ------------- | ----- |
| 0             | 1     |
| 1–39          | 4     |
| 40–79         | 30    |
| 80–119        | 43    |
| 120–179       | 42    |
| 180+          | 11    |

By type — Legend median 164 (max 251), Gear 117, Unit 95, Program 94. Legends carry roughly
70% more rules text than the average card.

### Does full-text search earn its place at 131 cards?

**Yes, and it's essentially free.** Vocabulary after stripping brace markup and punctuation:

| statistic                       | value                                                            |
| ------------------------------- | ---------------------------------------------------------------- |
| total tokens                    | 2,909                                                            |
| distinct terms                  | **261**                                                          |
| terms on exactly 1 card (hapax) | 92 (35%)                                                         |
| terms on ≥10 cards              | 71                                                               |
| terms on ≥50 cards              | 11 (`a, unit, this, to, if, turn, the, rival, friendly, 1, you`) |

Common phrase structure — cards sharing each phrase:

| phrase                                             | cards |
| -------------------------------------------------- | ----- |
| `a rival unit`                                     | 31    |
| `a friendly unit`                                  | 24    |
| `... or face up legend`                            | 16    |
| `to your hand`                                     | 14    |
| `power this turn`                                  | 13    |
| `equip to a friendly unit or face up legend`       | 12    |
| `at the end of your turn`                          | 11    |
| `☆ street cred`                                    | 11    |
| `you may spend this unit to redirect a rival unit` | 9     |

The corpus is 14.6 KB with a 261-word vocabulary. **Ship the whole thing to the client and
substring-match in memory** — an index would cost more than the data. No stemming needed at
this scale; 11 terms are pure stopwords and 92 are unique enough to identify a single card.

Note the recurring phrases are _templated rules language_, not shared abilities — 131/131
rules texts are still distinct. So text search is a good **finding** tool ("cards that
redirect", "cards that draw") and a useless **grouping** tool. Search box, never a facet.

### `?q=` — scope measured

`?q=` is a **case-insensitive substring** match over **name + rules_text +
classifications + every printing's artist**. Verified against local computation on 9 probes,
exact match on all 9:

| probe                     | API `total` | local `name ∪ rules ∪ class ∪ printing-artist` |
| ------------------------- | ----------- | ---------------------------------------------- |
| `Blocker`                 | 13          | 13                                             |
| `Merc`                    | 24          | 24                                             |
| `Ganger`                  | 26          | 26                                             |
| `Arasaka`                 | 17          | 17                                             |
| `Defeat`                  | 27          | 27                                             |
| `Adrenaline`              | 4           | 4                                              |
| `Mooncolony` (artist)     | 12          | 12                                             |
| `Pandart Studio` (artist) | 15          | 15                                             |
| `ADIA` (artist)           | 13          | 13                                             |

Two details worth keeping:

- **It is substring, not token.** `q=ADIA` returns 13 but only 12 cards have ADIA as an
  artist — the 13th is `Nadia — Fighting Through Grief`. Expect junk on short queries.
- **Artist matching is printing-level.** `q=Pandart Studio` → 15 while _zero_ cards have
  Pandart Studio as their flattened `card.artist`. This is the only way to reach artist
  server-side; there is no `?artist=` param (`?artist=Mooncolony` → 131, ignored).
- Case-insensitive, unlike every other param: `q=streetkid` → 1, whereas `type=unit` → 0.

---

## 7. Printing-level spread

385 printings over 131 cards. Per-card: 75 ×2, 17 ×3, 12 ×4, 26 ×5, 1 ×6 — matching notes §2.

### How often does a printing disagree with the flattened card copy?

| field                                | cards with ≥1 disagreeing printing | disagreeing printings            |
| ------------------------------------ | ---------------------------------- | -------------------------------- |
| `rarity`                             | **30 / 131** (23%)                 | 39 / 385 (10%)                   |
| `artist`                             | **33 / 131** (25%)                 | 48 / 385 (12%)                   |
| `rarity` **or** `artist`             | **35 / 131** (27%)                 | —                                |
| `set.code`                           | 130 / 131                          | expected — every card spans sets |
| `collector_number` vs `print_number` | 131 / 131                          | expected — renumbered per set    |

**Roughly one card in four has a printing whose rarity or artist contradicts what the card
object says.** That confirms notes §2 gotcha 2 and puts a number on it: this is not an edge
case worth a footnote, it's a quarter of the dataset.

### But the flattening itself is perfectly consistent

| assertion                                                      | result        |
| -------------------------------------------------------------- | ------------- |
| `selected_printing_id === printings[0].id`                     | **131 / 131** |
| `selected_printing_id === printing_id`                         | **131 / 131** |
| `selected_printing_id` found in `printings[]`                  | **131 / 131** |
| selected printing's `rarity` === `card.rarity`                 | **131 / 131** |
| selected printing's `artist` === `card.artist`                 | **131 / 131** |
| selected printing's `set.code` === `card.set.code`             | **131 / 131** |
| selected printing's `collector_number` === `card.print_number` | **131 / 131** |

So the card copy is _always_ a faithful mirror of `printings[0]`. It is never stale or
wrong — it is just **unrepresentative**. The mapper needs no reconciliation logic; it needs
to stop reading the card copy for facets. Derive `rarity`, `artist`, and `set` by unioning
over `printings[]`, and keep the card copy purely as "what to show by default" (notes §2
already says this; the 131/131 result is what licenses trusting `printings[0]`).

### Art variants beyond a straight retail/beta mirror

The clean signal is **two printings in the same set** — collector numbers are unique within
a set, so this is a genuine second art treatment rather than cross-set renumbering.

| measure                                                      | result                          |
| ------------------------------------------------------------ | ------------------------------- |
| cards with >1 printing in a single set                       | **23 / 131**                    |
| — of those, in `welcometonightcitybeta`                      | 22                              |
| — of those, in `PRM01`                                       | 1 (`Rebecca — Having a Moment`) |
| cards with letter-suffixed collector numbers (`005a`/`005b`) | **1** (`V — StreetKid` only)    |
| cards where all printings share one (artist, rarity)         | **96 / 131** — straight mirror  |
| cards with ≥2 distinct (artist, rarity) combos               | **35 / 131** — true variant     |
| distinct artists per card                                    | 98 ×1, 29 ×2, 4 ×3              |
| distinct rarities per card                                   | 101 ×1, 28 ×2, 2 ×3             |
| cards present in both a beta and a retail set                | 130 / 131                       |

So: **96 of 131 cards are a straight mirror** — the same art and rarity duplicated across
retail/beta printings, differing only in the set symbol burned into the render. The
remaining 35 carry a real variant, and those variants cluster hard:

| set hosting the variant                       | count |
| --------------------------------------------- | ----- |
| `welcometonightcitybeta`                      | 23    |
| `boxtoppersretail`                            | 6     |
| `boxtoppersbeta`                              | 6     |
| `embracingpowerretailstarterdeck`             | 4     |
| `embracingpowerbetastarterdeck`               | 3     |
| others (PRM01, heist, demo decks, prerelease) | 8     |

Design consequence: a variant picker is worth building, but it's dead UI for 73% of cards.
Show it conditionally — collapse to a single image unless the card has ≥2 distinct
(artist, rarity) pairs. Note the `a`/`b` art-treatment convention that notes §2 documents
for `V — StreetKid` is used by **exactly that one card** and is not a general pattern.

### Set codes present on printings, cross-checked against `?set=`

All 12 codes probed. **`?set=` matched the measured "cards with ≥1 printing in this set"
count exactly, 12 for 12:**

| code                              | printings | cards (measured) | `?set=` total | ✅  |
| --------------------------------- | --------- | ---------------- | ------------- | --- |
| `welcometonightcitybeta`          | 143       | 120              | 120           | ✅  |
| `welcometonightcityretail`        | 121       | 120              | 120           | ✅  |
| `theheistretailstarterdeck`       | 18        | 18               | 18            | ✅  |
| `theheistbetastarterdeck`         | 18        | 18               | 18            | ✅  |
| `mercdemodeck`                    | 15        | 15               | 15            | ✅  |
| `embracingpowerretailstarterdeck` | 15        | 15               | 15            | ✅  |
| `embracingpowerbetastarterdeck`   | 15        | 15               | 15            | ✅  |
| `arasakademodeck`                 | 14        | 14               | 14            | ✅  |
| `prereleasebeta`                  | 11        | 11               | 11            | ✅  |
| `boxtoppersretail`                | 6         | 6                | 6             | ✅  |
| `boxtoppersbeta`                  | 6         | 6                | 6             | ✅  |
| `PRM01`                           | 3         | 2                | 2             | ✅  |

Negative controls: `?set=bogus` → 0, `?set=prm01` → **0** (case-sensitive),
`?set=set1promos` → 0.

**This closes an open question from notes §8.** The notes recorded `set=set1promos → 0`
"while the list shows a `PRM01` card" and concluded set-code discovery was incomplete. It
isn't — `set1promos` is a slugified form of the set _name_ ("Set 1 Promos"), not its code.
`?set=PRM01` → 2, correctly. **Set-code discovery via `printings[].set.code` is complete
and `?set=` covers all 12.** The only real caveat is case sensitivity.

**As a filter:** the printing-level set is worth a control, but the shape is lopsided — two
sets hold 120 of 131 cards each, and the other ten are 6–18 card starter/demo/promo
products. Group as "main set" vs "special products" rather than a flat 12-item list. The
**card-level** `set.code` is near-useless as a facet: only 4 distinct values, and 120 of 131
cards say `welcometonightcityretail`.

---

## 8. `artist` — ⚠️ search only, and the data is dirty

57 distinct strings across 385 printings; 48 distinct at card level. Distribution is
bimodal — a few prolific studios and a long tail of one-offs:

| printings | cards | artist               |
| --------- | ----- | -------------------- |
| 29        | 13    | Daniel Valaisis      |
| 28        | 12    | ADIA                 |
| 25        | 12    | Mooncolony           |
| 20        | 7     | CD Projekt Red       |
| 19        | 5     | Olgierd Ciszak       |
| 18        | 7     | Łukasz Poller        |
| 18        | 7     | Michal Ivan          |
| 16        | 15    | Pandart Studio       |
| 15        | 7     | Michał Dziekan       |
| 12        | 6     | TOPDOG Entertainment |
| …         | …     | _47 more_            |

**31 of 57 artists appear on exactly one card**, and 3 on exactly one printing. As a facet
that's a 57-item list where over half the entries return a single result — near-unique, so
useless as a facet. Fine as a search term, which `?q=` already covers (§6).

### The strings need normalization before they're usable at all

Mechanical case + whitespace folding collapses 57 → 55:

| collapses                                                                         | note                 |
| --------------------------------------------------------------------------------- | -------------------- |
| `CD PROJEKT RED` (5 printings) + `CD Projekt Red` (20)                            | case only            |
| `Kieran McKeown & Giada Marchisio` (3) + `Kieran McKeown \n& Giada Marchisio` (2) | **embedded newline** |

That newline inside an artist name will break naive rendering and any `sort`/`group by`.

Beyond mechanical folding there are apparent typos and aliases. **Inferred** — these are
judgement calls, not measured identities:

| variants                               | printings | likely cause       |
| -------------------------------------- | --------- | ------------------ |
| `Ilya Kuvshinov` / `Ilya Kushinov`     | 7 / 2     | typo               |
| `Alexander Dudar` / `Alexander Duder`  | 5 / 2     | typo               |
| `Jesús Hervás` / `Jesus Hervás`        | 2 / 2     | dropped accent     |
| `Łukasz Poller` / `Luke Poller`        | 18 / 2    | anglicization      |
| `Envar` / `Envar Studio`               | 7 / 2     | short vs full name |
| `Bad Moon Studio` / `Bad Moon Studios` | 2 / 1     | plural             |

Merging those six pairs would take the true artist count to roughly **49**. Four strings
also encode collaborations with `&` (`Rafael de Latorre & Clonerh`,
`Miguel Valderrama & Jason Wordie`, and the two Kieran McKeown forms) — a genuine
many-to-many that a single string field can't represent.

**Verdict: search only.** Building an artist facet would require a hand-maintained alias
table for a control where half the options return one card. Display it on the card detail
page; let `?q=` handle lookup.

---

## 9. Query-param semantics — corrections and additions to notes §1

The notes' param table is correct as far as it goes but understates what works. Every row
below was asserted with a negative control (a bogus value returning 0 proves the param is
recognized; 131 proves it's ignored).

### Newly verified as working — not in notes §1

| param             | example                    | total   | cross-check                     |
| ----------------- | -------------------------- | ------- | ------------------------------- |
| `classifications` | `classifications=Merc`     | 23      | = measured Merc count           |
| `eddiable`        | `eddiable=true` / `=false` | 66 / 65 | = measured `is_eddiable`        |
| `cost`            | `cost=3`                   | 24      | = measured `cost:3`             |
| `power`           | `power=4`                  | 14      | = measured `power:4`            |
| `ram`             | `ram=2`                    | 75      | = measured `ram:2`              |
| `keywords`        | `keywords=Bogus` → 0       | —       | recognized but unmatchable (§5) |

### Confirmed ignored (return all 131)

`classification` (singular), `keyword` (singular), `is_eddiable` (with prefix), `legality`,
`artist`, `finish`, `card_type`, `colors`, `search`, `name`, `sort`, `order`,
`include_printings`, `group_by`.

Note the near-miss naming: the working params are `type` (not `card_type`),
`classifications` (plural), `eddiable` (no `is_` prefix), and `color` (singular). Three of
the four obvious guesses fail open.

### Three behaviours that will bite

**1. Comma-separated values are OR — on some params only.**

| query                                     | total | local check                  |
| ----------------------------------------- | ----- | ---------------------------- |
| `color=Red,Blue`                          | 64    | 32 + 32 ✅                   |
| `type=Unit,Gear`                          | 80    | Unit ∪ Gear = 80 ✅          |
| `cost=1,2`                                | 27    | 10 + 17 ✅                   |
| `classifications=Merc,Corpo`              | 39    | OR = 39 (AND would be 1) ✅  |
| `classifications=Arasaka,Corpo`           | 23    | OR = 23 (AND would be 11) ✅ |
| `ram=5,6`                                 | 2     | 1 + 1 ✅                     |
| **`rarity=Secret,Epic`**                  | **0** | ✗ comma not supported        |
| **`set=boxtoppersretail,boxtoppersbeta`** | **0** | ✗ comma not supported        |

So multi-select works for `color`, `type`, `cost`, `power`, `ram`, `classifications` — and
**silently returns zero results** for `rarity` and `set`, the two printing-scoped params.
Unknown values in a list are dropped rather than erroring (`type=Unit,Bogus` → 65). A space
after the comma breaks the request.

**2. Repeating a param fails open.** `?color=Red&color=Blue` → **131**, and
`?classifications=Merc&classifications=Ganger` → **131**. The idiomatic HTML-form way to
express multi-select disables the filter entirely and looks like success. Always serialize
multi-select as one comma-joined param.

**3. Everything except `q` is case-sensitive.** `type=unit`, `color=red`, `rarity=common`,
`set=prm01` all → 0. `q=streetkid` → 1.

Combining different params is a plain AND, verified against local data:

| query                            | total | local |
| -------------------------------- | ----- | ----- |
| `type=Unit&color=Red`            | 16    | 16 ✅ |
| `type=Legend&cost=5`             | 4     | 4 ✅  |
| `classifications=Merc&color=Red` | 7     | 7 ✅  |
| `type=Unit&eddiable=true`        | 1     | 1 ✅  |
| `rarity=Rare&type=Legend`        | 13    | 13 ✅ |
| `set=PRM01&type=Unit`            | 0     | 0 ✅  |

---

## 10. Recommendation

At 131 cards the whole dataset — including 14.6 KB of rules text — is small enough to ship
to the client and filter in memory. The server params are useful for validating a local
implementation, not for driving the UI, and their traps (§9) are a reason to avoid them.

**Ship these controls:**

1. `card_type` — 4 values, primary axis
2. `color` — 4 values, best-balanced field
3. `classifications` — 39 values, ideally split into faction vs subtype
4. **keywords parsed from `rules_text` `{...}` markup** — 9 values, not the API field
5. `rarity` **unioned over `printings[]`** — 9 values, not the 6 on the card
6. `cost` — range 1–9, with an explicit "no cost" bucket for the 17 Legends
7. set — from `printings[]`, grouped main-set vs special products
8. free-text search over name + rules_text
9. `power` — range 0–15, hidden or caveated when Program is selected
10. `ram` — range 1–6, low value; ship only if free

**Cut:** `legality`, `is_eddiable`, `finish`, `subname`, `flavor_text`, the API's own
`keywords[]`, `print_number` as a facet, `artist` as a facet, and card-level
`set`/`rarity` as filter sources.

**Fixture for tests:** `Rebecca — Having a Moment` — null on `cost`, `power`, `ram` and
`rules_text`, empty `classifications`, and the only non-`welcometonightcity` default
printing.

---

## Appendix — reproduce

```bash
B="https://api.netdeck.gg/api/cards/cyberpunk"
mkdir -p /tmp/fc/nd
for o in 0 100; do curl -s "$B?limit=100&offset=$o"; done | jq -r '.items[].slug' > /tmp/fc/slugs.txt
cat /tmp/fc/slugs.txt | xargs -P 16 -I@ sh -c "curl -s '$B/@' -o /tmp/fc/nd/@.json"
jq -s '.' /tmp/fc/nd/*.json > /tmp/fc/full.json     # 131 cards, 385 printings

# assert a param is real: bogus value must return 0, not 131
curl -s "$B?limit=1&classifications=Bogus" | jq .total   # 0  -> recognized
curl -s "$B?limit=1&artist=Bogus"          | jq .total   # 131 -> ignored

# the keyword vocabulary the API doesn't give you
jq -r '.[].rules_text | select(.) | scan("\\{[^}]+\\}")' /tmp/fc/full.json | sort | uniq -c | sort -rn

# printing-level rarity, the 9-value vocabulary
jq -r '[.[].printings[].rarity] | group_by(.)[] | "\(length) \(.[0])"' /tmp/fc/full.json | sort -rn
```

> `image_url` is a signed 24h CloudFront URL re-minted per request (notes §3) — it is
> deliberately not recorded anywhere in this document. Diff on `source_image_url`.
