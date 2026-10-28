# Spec — Nova Notation

Folds the sibling `novanotation` project into novastack. This document records the **decisions**
that shaped the fold; it is deliberately not the notation's spec. **The public reference page
(`/notation/reference`) is the spec** — its tables render from `#lib/notation` and every worked
example is asserted in `src/lib/notation/*.spec.ts`, so prose and validator cannot disagree.
`docs/notation.md` from the old repo was deleted rather than ported, for the same reason.

## Decisions

- **Audience: tournament players and judges first.** Organized play is the only place a notation
  has a job. Casual/streamer use is a secondary reader; tool-builder use is premature.
- **Section, not a page.** `/notation` is the front door and a stepped, read-only worked game (the
  validator is not the landing page). Then `/notation/reference`, `/notation/scoresheet`,
  `/notation/check`. A top-level nav link; `Sets` moves into a `Cards` dropdown, like `Decks`.
- **"Nova" is the user's brand, not the game.** Copy says "Cyberpunk TCG". Terms that collide with
  the glossary (**Set** the action, **Owner**) keep their names, because the Comprehensive Rules
  name them; `CONTEXT.md` disambiguates.
- **Reactions are reserved, not taught.** Cards can be played in the React Step (CR §9.7), but none in
  the current pool changes a die there, so there is nothing for the notation to record: the front
  door's example game has no Reaction, and the reference page files them under "Reserved: Reactions".
  "Reaction" is the CR's own word, replacing the earlier "Instant". The syntax and checker still
  support them, for when a card does.
- **Two voices.** The intro on `/notation` tells a turn in first person ("I rolled my d10 and it
  rolled a 6… I stole my Rival's d6 and d4") via `narrateTurn`, because WE and THEY are the jargon the
  reader has not learned yet. Tooltips keep WE/THEY (`describeMove`), since they are matched against
  the sheet.
- **The notation follows the Comprehensive Rules** (audit: `docs/research/notation-cr-audit.md`):
  every Turn begins with exactly one roll-in while the Fixer has dice (§8.6.5), so a pass is only
  possible once it is empty; with six dice each, overtime always begins as turn 14 ends (§1.11); the
  public pages say Rival.
- **Swap is `A<>B'`** (CR §6.7): infix, no value, either order (which die is the actor's is read off the
  board), `<->` and `↔` accepted. It is not a Steal (§6.7.2) and never counts toward the overtime
  win. Other shapes were weighed — `A/B'` (shortest, but reads as a fraction), `A&B'`, a prefix
  letter (`s` handwrites like `5`), and a steal-flavoured `xB'>A` (rejected: §6.7.2).
- **Hover text** is `describeMove(move, context?)`: state-aware when a board is known ("WE lowers
  their d6 from 4 to 2"), general otherwise. One function feeds the tooltip and error text. The
  token is a focusable button: hover (~400ms), focus, or tap all show the same text.
- **Scoresheet** is a print-styled HTML page first; a pinned PDF only after a real event has
  exercised the layout. Only the printed sheet carries `Draft v0.1`. **One landscape page holds four
  best-of-three matches** (three game columns each, in a 2×2), with the site's nine-square mark in
  the header. The cost is writing room: rows are about 4.3 mm and a game's ink column about 35 mm,
  against 6 mm and 53 mm for two matches on a portrait page — to be tried with a real pen before it
  is trusted. A portrait two-up layout was built and measured first; it is the fallback. **Each game has sixteen rows** — the checker's
  soft cap; nobody has played past it, so the sheet has no turns 17+. **No notes box**: the tournament
  regulations allow only objective, public information to be written down, and anything only
  briefly public (a card glimpsed in a hand) must not be. Dice state and the result circle are the
  whole record. The `first:`/`result:` options are printed plain; the player circles their own.
- **Sharing** is the transcript encoded in the URL on `/notation/check` — no backend, no D1. A
  short-code layer (`/n/[code]` → encoded URL, like `/l/[code]`) can be added later without
  breaking links. The encoding is unversioned until something forces a second one.
- **Style** is novastack's tokens and Monaspace Krypton; the old CRT look and its Google Fonts are
  gone.
- **Rules were audited against the Comprehensive Rules** (`docs/research/notation-cr-audit.md`, CR as of
  2026-10-28), and the reference cites a section for each enforced game rule. The CR is a living
  document: re-check the citations if it is revised.
- **Staging: deployed, then discoverable, then indexed.** The routes landed `noindex` and out of the
  sitemap; the nav (a top-level `Notation` link, with `Sets` under a `Cards` dropdown) went live once the
  CR audit was done. `NOTATION_LAUNCHED` governed search, and was flipped on 2026-10-28: `noindex` is gone and the pages are
  in the sitemap. The `novanotation.net` → `novastack.gg/notation` 301 is switched on
  in Cloudflare and the old repo archived with a pointer.
- **One section nav.** `routes/notation/+layout.svelte` renders `SectionNav` (Learn · Reference ·
  Scoresheet · Check a game) over all four pages, current page marked, hidden in print. Pages link to
  each other in prose only where a sentence needs it.
