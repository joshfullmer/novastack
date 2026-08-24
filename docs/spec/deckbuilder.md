# Spec — Deckbuilder (stage 2)

An account-backed deckbuilder for the Cyberpunk TCG, built on top of novastack's card database.
This document is implementation-ready: every design decision it records has been made, and the
places where one hasn't are collected under [Open questions](#open-questions).

**Scope.** Deck construction and legality, persistence, deck library management, sharing/export,
and a minimal public deck explorer. Playtesting/hand-drawing simulators and tournament/meta
analytics are explicitly **out of scope** — separate future projects, not deferred parts of this
one.

**Rationale lives elsewhere.** This spec says _what_; the reasoning, the false starts, and the
mid-design corrections are in `.scratch/deckbuilder/` (map + six resolved tickets) and in the
prototype code at `src/routes/prototype/deckbuilder/`. Terminology is defined once in `CONTEXT.md`
and used here without redefinition — in particular **Legend**, **RAM Required** / **RAM
Provided**, and **Deck Entry**, all already stubbed there under "Decks (stage 2)."

---

## 1. Hard constraints

Inherited from `docs/spec/card-database.md`, unchanged for the card database itself:

1. **No type coercion.** `as`, `!`, and other assertions are forbidden.
2. **Never trust the source API's shape.** Unchanged — the deckbuilder consumes the same committed
   card snapshot, never the live API.
3. **Never hotlink card images.**

**Revised for this stage:**

4. **Static-everything no longer holds site-wide — it holds everywhere except the deckbuilder.**
   `/`, `/cards`, and `/cards/[slug]` keep their exact current fully-static, fully-prerendered
   shape (`export const prerender = true`, `adapter-cloudflare`'s per-route granularity). Only the
   new deckbuilder routes (§7) are dynamic, backed by real Worker requests against D1. This is a
   deliberate, scoped exception, not an abandonment of the original constraint.

**New:**

5. **A real backend now exists, and its blast radius is scoped on purpose.** Accounts, decks, and
   likes are the only things it owns. No feature on this map may casually grow the backend's
   surface (e.g. server-rendered images, a second database) without revisiting this constraint —
   see §6's rejection of server-rendered deck images for the shape of that reasoning.

---

## 2. Deck construction rules

Stated directly by the person who knows the game; not derived, not inferred from the source API.

- Deck size: **minimum 40, maximum 50** main-deck cards. Legends do not count toward this.
- **Up to 3 copies** of a given Card in the main deck.
- **Exactly 3 Legends**, chosen separately from the main deck.
- **Legality**: a Card's `ramRequired` (in its own `Color`) must not exceed the **sum of the 3
  chosen Legends' own `ramProvided`** in that Color.

  ```ts
  // src/lib/filters/budget.ts — unchanged, reused as-is
  function admits(budget: ColorBudget, card: Card): boolean {
  	const available = budget[card.color];
  	if (available <= 0) return false;
  	return card.cardType === 'Legend' || (card.ramRequired ?? 0) <= available;
  }
  ```

  The budget is built by **summing the 3 chosen Legends' actual `ramProvided`**, not by
  multiplying a slot count by the dataset's `ramPerLegend` constant. This is deliberately
  forward-compatible with Legends ever providing non-uniform RAM — several Cards already carry
  RAM costs that don't fit the uniform-2 assumption cleanly, so the deck's budget must reflect
  what the actual chosen Legends provide, not a derived stand-in. `admits()` needs no changes
  either way — it already takes a plain `ColorBudget`.

---

## 3. Data model

### 3.1 Deck schema

Mirrors `CONTEXT.md`'s Deck Entry (a Card plus a quantity, plus an optional chosen Printing)
directly:

```ts
type DeckEntry = {
	cardSlug: string;
	quantity: number; // 1–3
	printingId?: string; // optional; falls back to the Card's Default Printing
};

type DeckVersion = {
	entries: DeckEntry[];
	legends: [string, string, string] | string[]; // up to 3 Legend card slugs
	savedAt: string; // ISO timestamp
};
```

### 3.2 Storage — D1 via Drizzle

Two tables, snapshot-versioned, not edit-by-edit:

```
decks           id, ownerId, name, visibility ('public' | 'unlisted' | 'private'), createdAt
deck_versions   id, deckId, entries (JSON), legends (JSON), savedAt
deck_likes      deckId, userId, likedAt          — unique on (deckId, userId)
```

- A deck's **current state is its latest `deck_versions` row** by `savedAt`. `decks` holds no
  denormalized copy of the current entries/legends.
- **Every explicit save creates one new `deck_versions` row** — changeset granularity, not
  edit-by-edit. No separate "commit a checkpoint" action distinct from ordinary saving; one save
  concept, matching Moxfield's own version-history granularity rather than an audit log that would
  balloon row count for no real user-facing benefit.
- **No `deck_entries` relational table.** A deck is always read and written as one whole unit —
  there is no per-entry query need (no "which decks run card X"; that's meta/analytics territory,
  explicitly out of scope). One JSON blob per version is consistent with this project's existing
  whole-document bias (`cards.json`).
- `decks.visibility` is one of three states — **public** (listed in the explorer, §8), **unlisted**
  (accessible by its link, not listed anywhere), or **private** (owner-only, no working share
  link for anyone else).

### 3.3 Accounts

**Better Auth + Drizzle ORM + Cloudflare D1**, scaffolded via SvelteKit's own CLI
(`npx sv add better-auth`, `npx sv add drizzle`) rather than hand-rolled. This is the
officially-documented, CLI-scaffolded path for exactly this combination — session handling and
password hashing are a maintained library's job.

- **Email/password now.** No email verification, no password-reset flow — deliberately deferred
  (see [Open questions](#open-questions)); an unverified email is an acceptable risk at this
  project's stakes, and skipping it keeps the new backend to exactly one dependency (D1) instead
  of two (D1 + an email-sending provider).
- **Discord OAuth is an explicit fast-follow**, not built now. Better Auth's provider list
  includes Discord, so it slots in later with no new infrastructure.

---

## 4. Legality enforcement

Building order is **free, not Legend-first** — a real correction found while reacting to a working
prototype, revising an earlier draft of this spec that assumed Legends were always chosen before
any card could be added.

- **≤3 copies of a card: blocks on add.** Checkable the instant a card is added, and there is no
  "fix it later" workflow for a 4th copy — it's noise, not a state worth representing.
- **RAM budget: does not block adding at all.** A card can be added to the main deck with zero
  Legends chosen. Once at least one Legend is chosen, the deckbuilder's card browser narrows to
  what the current budget supports (§5) — but this is a display filter, not an add-time gate; the
  underlying `addCard` operation itself never rejects a card for RAM reasons.
- **Deck size (40–50): never blocks, always a visible, persistent readout.** A deck under
  construction is supposed to sit outside 40–50 most of the time. There is no sensible "block"
  moment for an unfinished count.
- **Any mismatch between the deck's entries and the current Legends' budget surfaces as a
  persistent error banner** in the deckbuilder screen — listing the offending entries by name,
  never silent. This is the authoritative legality signal for RAM; nothing about it depends on
  _when_ the mismatch arose (cards added before Legends existed produce the identical banner to
  cards that became illegal after a Legend was swapped out).
- **Saving an illegal deck (wrong size, or a RAM mismatch) is allowed.** A deck-in-progress is a
  reasonable thing to persist and resume later; version history makes this lower-risk either way.

---

## 5. Deckbuilder screen (`/decks/[id]`)

The winning layout from three working prototype variants — reference implementation at
`src/routes/prototype/deckbuilder/VariantA.svelte` — refined live past its first draft. Not a
modal, not the card database's own filter panel repurposed: a permanent two-panel split.

### 5.1 Layout

- **Left panel — card browser.** Two tabs, **Legends** and **Main Deck**, each with its own search
  box. **Both search boxes run through the real query language** (`#lib/query/index.js`, the same
  parser `/cards` uses), intersected with the tab's own intrinsic filter:
  - **Legends tab**: `card.cardType === 'Legend'`, further narrowed to colors already present in
    the deck once the deck is non-empty (an empty deck imposes no color filter — nothing to be
    relevant to yet). A chosen Legend always stays visible regardless of the color filter, so it
    can be deselected.
  - **Main Deck tab**: `card.cardType !== 'Legend'`, and once at least one Legend is chosen, also
    narrowed to `admits(budget, card)`.
  - **Non-addable cards are filtered out of the grid entirely — never shown, greyed out, or
    disabled.** The ≤3-copy limit applies identically in both tabs.
  - **Density control**: same affordance as `/cards` (a `−`/count/`+` stepper), **default 8**
    columns, range 2–12.
  - **Sort**: the same `DEFAULT_SORT` as `/cards` (Color → Card Type → Cost → Name) — this screen
    does not invent its own convention where one already exists.
- **Right panel — deck-in-progress, fixed width.**
  - **3 Legend slots** at the top, each showing the chosen Legend's art or an empty placeholder.
    Clicking a filled slot removes that Legend (equivalent to deselecting it in the Legends tab).
    The combined RAM budget (per Color) is shown beneath the slots.
  - **RAM-violation banner** (§4), shown only when non-empty, directly below the Legend slots so
    it's visible regardless of which tab is active.
  - **Main Deck header**: live count against 40–50, tinted by status (on-track / over), plus a
    **List/Gallery toggle**. List view shows compact rows (quantity × name, remove button) with a
    **hover-preview** of the full card art; Gallery view shows a thumbnail grid with quantity
    badges, click-to-remove-one.
  - **Bottom toolbar**: Export (§6) and Save deck (§3.2 — creates one new `deck_versions` row).

### 5.2 A layout detail worth stating explicitly

The panel must be viewport-fixed below the shared nav (`position: fixed`, sized to the remaining
viewport), **not** a plain full-height block in normal document flow. The latter, combined with
the shared layout's nav and footer, produces a page taller than the viewport — a confusing
double-scroll where the last row of the card grid is reachable only by first exhausting the
grid's own inner scroll and then discovering an outer page scroll was also needed.

---

## 6. Sharing & export

- **Visibility** is the three-state model from §3.2. A share link works for public and unlisted
  decks; a private deck has no working link for anyone but its owner.
- **Share links are live**, not frozen at share time — a link points at the deck, and whatever the
  owner most recently saved is what a viewer sees. Version history (§3.2) already answers "what
  did this look like before" for anyone who needs it; the link itself carries no separate version
  concept.
- **Plain-text export**, both copy-to-clipboard and file download, one format:

  ```
  Legends:
  1 Adam Smasher — Ender of Legends
  1 Alt Cunningham — Soulkiller Architect
  1 Dexter DeShawn — Off the Grid

  Main Deck (43):
  3 6th Street Recruits
  2 Chrome Fang
  ...
  ```

  Quantity-first, a labelled Legends section separate from Main Deck. This is a human-paste format
  (Discord, forums), not a machine-import format — no card-Id or Printing encoded.

- **Image export, client-side canvas, no new backend surface.** Composited entirely in the
  browser from the deck's already-mirrored, same-origin static card art (`drawImage()` into a
  `<canvas>`, then `toBlob()`/`toDataURL()` for download) — zero new Worker cost. Composition
  matches swudb.com's own "Deck image" feature, verified live: a header (deck name + owner), a
  Legends strip standing in for its Leader+Base pair, the Main Deck as a thumbnail grid with
  quantity badges, and a small novastack URL/QR-code watermark for attribution.

  **Server-rendered images at a stable, hotlinkable URL were considered and rejected.** The
  `satori` + `resvg-wasm` pattern (the standard Workers-compatible stack for this) would add real
  new infrastructure — a rendering pipeline and a Worker route — for a capability client-side
  canvas already covers, violating this spec's own §1.5 constraint on backend blast radius.

---

## 7. Routes

| route                 | rendering | contents                                                                                 |
| --------------------- | --------- | ---------------------------------------------------------------------------------------- |
| `/decks`              | dynamic   | Tabbed: **My Decks** (§8) and **Explore** (§9)                                           |
| `/decks/new`          | dynamic   | Creates a draft deck, redirects to `/decks/[id]`                                         |
| `/decks/[id]`         | dynamic   | The deckbuilder screen (§5) — owner sees an editor, others a viewer, gated by visibility |
| `/decks/[id]/@[user]` | —         | Not a real route; a user's public decks are a filtered view of §9, not a new surface     |

Auth routes (`/auth/login`, `/auth/logout`) use Better Auth's session/email-password logic from
the `sv add better-auth` scaffold, but with **custom-styled pages matching this site's own visual
conventions** (dark theme, existing component patterns) rather than the scaffold's generic demo
markup — updated during implementation once it was clear the raw scaffold pages would look out of
place on an otherwise art-forward, deliberately-themed site. The library's auth _logic_ is still
the decision; its default _pages_ are not what ships.

`/`, `/cards`, `/cards/[slug]` are unchanged from `docs/spec/card-database.md` and keep prerendering.

---

## 8. Deck library (`/decks`, "My Decks" tab)

- **Row operations, all from the list, no need to open the deck**: rename, duplicate, delete,
  change visibility.
  - Duplicate is a quick-action icon directly on the row — verified live on swudb.com's own deck
    list.
- **No cap on saved decks.** The backend is D1, not local storage; there's no size-pressure reason
  to limit it, and none of the three inspiration sites impose one.
- **Row content**: deck name, the 3 Legend portraits, main-deck card count against 40–50, a
  visibility badge, last-saved date (the latest `deck_versions.savedAt`). No social/count columns
  — those belong to the Explore tab, not "my decks."

---

## 9. Public deck explorer (`/decks`, "Explore" tab)

Grown out of §3.2's visibility model: "public" is meaningless without somewhere to list public
decks, so this is part of the destination even though it wasn't in the original scope survey.

- **Lives as a tab on `/decks`**, not a separate route — matches swudb.com's own `/decks/` area
  (My Decks / Hot / Discussed / New / Top all under one route).
- **Sort options: Hot, Newest, Most-liked.** This requires a real **likes** feature (`deck_likes`,
  §3.2) — a signed-in user can like a public deck once, and decks carry a count. All three
  inspiration sites treat some form of like/favorite count as load-bearing for their own
  hot/explorer pages, not decorative.
- **"Hot" is likes within a rolling recent window (~14 days), not all-time popularity** — distinct
  from "Newest" (recency only) and "Most-liked" (all-time). A simple, explainable heuristic
  matching genre convention.
- **Search and column filters (by color, Legend, name) are deliberately not in this first cut** —
  see [Open questions](#open-questions).
- **Row content**: deck name, owner (a link — a user's public decks are the same row-list, filtered
  by owner, not a new surface), the 3 Legend portraits, main-deck card count, like count with a
  like toggle for signed-in viewers, creation date. No visibility badge — the tab itself is
  filtered to public decks only.

---

## Open questions

Things a reader will reasonably ask that this spec does not answer.

1. **Deck statistics / analysis breakdown** — color balance, cost curve, sellable (Eddiable)
   ratio. Called out directly as important, but not sharp enough to spec: does it live on the
   deckbuilder screen itself, a separate tab, or only on a saved deck's viewer page?
2. **Printing selection UX within the deck-building flow** — where and how a Deck Entry's optional
   Printing gets overridden from its Default. Minor; not addressed by the prototype.
3. **Import from another deckbuilder's format.** Export format (§6) is settled; what's importable
   — round-tripping novastack's own text export, or parsing other tools' formats — is not.
4. **Mobile/responsive behavior for the deckbuilder screen.** Not addressed by the prototype,
   which was built and reviewed desktop-only.
5. **Exact 3-Legend RAM-threshold solving.** The Legends tab's color-presence filter (§5.1) is a
   coarse approximation, not a full combinatorial solve of "could some combination of 3 Legends
   cover this deck." The RAM-violation banner (§4) is the authoritative signal regardless; this
   filter is convenience narrowing only, and could be sharpened later.
6. **Discord OAuth login.** An explicit fast-follow to email/password auth (§3.3); Better Auth
   supports it as a provider with no new infrastructure, but it isn't built now.
7. **Email verification & password-reset flows.** Deliberately deferred alongside the backend
   decision (§3.3); would need an email-sending provider (e.g. Resend), a dependency not added yet.
8. **Explorer search/filtering** (§9) — by color, Legend, or name. Deferred until there's enough
   deck volume to justify it.

---

## Provenance

| document                                          | holds                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `CONTEXT.md`                                      | the domain glossary — Legend, RAM Required/Provided, Deck Entry             |
| `docs/spec/card-database.md`                      | stage 1; this spec's own conventions and the card data this stage builds on |
| `.scratch/deckbuilder/map.md`                     | the wayfinder map — destination, notes, all six resolved tickets            |
| `.scratch/deckbuilder/issues/01-…` through `06-…` | the individual decisions, with full reasoning and rejected alternatives     |
| `src/routes/prototype/deckbuilder/`               | working prototype code for §5's screen layout, plus `NOTES.md`              |
| `src/lib/filters/budget.ts`                       | `admits(budget, card)`, reused unchanged for deck legality                  |
