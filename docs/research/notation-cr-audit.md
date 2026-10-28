# Nova Notation against the Comprehensive Rules

> **Status, 2026-10-28 (after the owner's review).** All six findings are settled and implemented.
> **Swap** is written `A<>B'` (infix, either order, `<->` and `↔` accepted), and is not a Steal. All nine game rules now carry a CR
> citation (the owner confirmed that "a Gig" in the CR means any Gig, so `modify-in-gigs` is §6.4,
> §6.5). The text below is the original audit, kept as the record.
>
> - **1** Overtime: confirmed as "turn 15 always" — one roll a turn, six dice each, empties both Fixers
>   by turn 12, so overtime begins as turn 14 ends. The checker now also ends the game when the player
>   who just moved holds seven at that moment (§1.11.2): `how: 'overtime-start'`.
> - **2** One roll-in a turn is enforced (first move, exactly one, while the Fixer has dice).
> - **4, 5** The soft cap is a Convention; Reactions (formerly "Instants") are reserved syntax, off the game-rules table.
> - **6** The public pages say Rival.

The audit `TODO.md` ("Notation: launch checklist") blocks launch on: every game rule the checker
enforces, set against the Comprehensive Rules (CR), with the section that backs it.

**Source.** The official page, <https://cyberpunktcg.com/comprehensive-rules>, is a client-rendered
app with no text in its HTML (no `llms.txt` either). Its own loader reads
`https://api.netdeck.gg/api/cyberpunk/comprehensive-rules` — 733 numbered nodes, `updated_at`
**2026-10-28T15:49Z**. That is what was read; section numbers below are as of that timestamp and the CR
is a living document, so re-check a citation if the number matters later.

**Read in full:** §1 (overview, win/lose conditions), §5.10 (fixer area), §6 (Gigs), §8.5–8.7 and
§8.17–8.18 (turn, start phase, end of turn), and the headings of §7, §9 and §11.5. **Not read line
by line:** the rest of §8–§11 (phases other than the start phase, attack mechanics, effects, terms).
Findings are therefore "found in the CR" with confidence, and "not found" only as far as a text
search of the whole document goes.

## The ten rules

| Rule (`RULES` in `reference.ts`)                                            | Verdict                                 | CR                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `roll-own` — a die is rolled by its own player, from their Fixer            | **Confirmed** (cited)                   | §8.6.5 "Roll in a Gig from your fixer area"; §1.7.1 you own your dice                                                                                                                                        |
| `d20-last` — d20 only when last in the Fixer                                | **Confirmed**, wording is exact (cited) | §8.6.5.1.1 "only choose the d20 if there are no other Gigs in your fixer area"                                                                                                                               |
| `steal-from-opponent` — from the opponent's Gigs; value kept                | **Confirmed** (cited)                   | §6.8, §11.5.1, §11.5.1.2 "A Gig's value can't change during stealing"                                                                                                                                        |
| `modify-in-gigs` — Increment/Decrement/Set/Reroll on a die in anyone's Gigs | **Partly** — pending                    | §6.4 adjust, §6.5 set, §6.1.4 (fixer dice can't be targeted). Whether an effect may adjust a **Rival's** Gig is up to the card text; samples say only "a Gig".                                               |
| `value-bounds` — 1..sides; `+` must raise, `-` must lower                   | **Confirmed** (cited)                   | §6.3.3 min 1 / max = sides; §6.4.3 can't adjust to the value it has (the effect fails); §6.5.1 can't set off the face                                                                                        |
| `instants-modify-only`                                                      | **No CR rule** — pending                | The CR has a _React Step_ (§9.7, §9.7.1): the defending player may react during the attacker's turn. That is what an Instant would be. There is nothing about "control cannot change in the instant window". |
| `turn-order` — alternate, odd turns are the first player's                  | **Confirmed** (cited)                   | §7.5.2 the chosen player decides to go first or second; §8.18 "your Rival's turn begins automatically"                                                                                                       |
| `win-regulation` — 7+ Gigs at the start of your turn                        | **Confirmed**, exact (cited)            | §1.10 and §1.10.1 (checked before the Ready Step); §8.6.1                                                                                                                                                    |
| `win-overtime` — from turn 15, a Steal to 7 wins                            | **Differs** — pending                   | §1.11, §1.11.1, §1.11.2, §8.17 — see Finding 1                                                                                                                                                               |
| `soft-cap` — 16 turns, warns past it                                        | **Not in the CR** — pending             | A text search of the CR finds no turn limit. It is a notation convention.                                                                                                                                    |

## Findings that need a decision

### 1. Overtime is not "turn 15"

> **§1.11.1** Overtime begins after two consecutive turns in which both players begin with an empty
> fixer area. (Usually, after both players have completed 7 turns each.)
> **§1.11** In overtime, if you have seven (7) or more Gig dice in the friendly Gig area **at any
> point**, you immediately win the game.
> **§1.11.2** If you already have seven (7) or more Gig dice when overtime begins, you win immediately.
> **§8.17** When your turn ends … if Overtime conditions are met, Overtime immediately begins.

`OVERTIME_START = 15` is the **usual** case (7 turns each, so overtime starts after turn 14), not the
rule. The real trigger is state — both Fixers empty at the start of two consecutive turns — and the
checker already tracks the Fixer, so it can be exact. Three differences:

- **Trigger.** A player who rolls their dice early or late moves the start. (Under §8.6.5 you roll in
  one a turn, so seven turns each is normal, but the CR states the condition, not the count.)
- **"At any point".** In overtime any route to 7 Gigs wins, not only a Steal. In practice only a
  steal or a take-control changes the count once the Fixers are empty (a swap, §6.7, does not).
- **Overtime begins with 7+ already held** (§1.11.2): that player wins at once, even if it is the
  rival's turn next. If _both_ hold 7+, §1.13.1 makes it a tie.

The scoresheet's shading of rows 15–16 as overtime is the same approximation; "usually" is accurate.

### 2. The CR has a mandatory roll-in, once, at the start of every turn

§8.6.5 sits in the **Start Phase**, whose steps "you must take … in this order" (§8.6): check for 7
Gigs, start-of-turn effects, ready, draw 1, **roll in one Gig from your Fixer**. So a legal turn begins
with exactly one Roll while the Fixer is not empty, and has none once it is. (Kerry Eurodyne's text,
"When you roll in a Gig from your fixer area, you may ignore the result and reroll it once", is what
`~` Reroll records.)

The checker does not know this. It accepts a turn with two Rolls (`A4 B3`), a Roll after other moves
(`xB' A4`), and a turn with no Roll while the Fixer still has dice (`..` or `xB'` alone) — all
illegal. Enforcing it would catch the most likely transcription slip on a real sheet (a forgotten
roll). **It is stricter than today's checker, and some existing tests and examples break the rule on
purpose** (the `WE_ROLLS_FIVE` tests pass with `..` while a Fixer still has dice; the _Skirmish_
preset's turn 6 is a bare steal), so it needs a decision, not just a patch.

### 3. A swap cannot be written

> **§6.7** To swap a Gig is to choose a friendly Gig die and a rival Gig die, then move the friendly
> Gig die to the rival Gig area and the rival Gig die to the friendly Gig area at the same time.
> **§6.7.1** The values … remain the same. **§6.7.2** A swap is not considered stealing.

The card pool has the effect "Swap a friendly Gig with a rival Gig" (a {Play} effect, in three
textual forms), and the FAQ asks "is a swap stealing a Gig?". In the notation a Steal only moves a die from the opponent to
the actor; the other leg would be the _opponent_ receiving a die, which is neither a Steal nor
something a Reaction may do. Written as two Steals (`xB'` then `xA`) the second fails, because `A` is
already the actor's. The notation needs a swap move, or an explicit statement that swaps are out of
scope. Whichever it is, it must **not** count as a Steal for the overtime win (§6.7.2).

### 4. The soft cap is a convention, not a rule

Nothing in the CR limits turn count. Either move `soft-cap` to **Conventions** on the reference page
(it is a checker warning about a transcript's length) or drop it. The scoresheet already stops at 16
rows for the same reason.

### 5. `instants-modify-only` (now: reactions) belongs with the reserved syntax

If Reactions are reserved, a rule about what they may do is a notation convention too. Its stated
reason ("control cannot change in the instant window" — the old "Instant" wording) has no CR text behind it. The React Step
(§9.7) is the nearest real thing: the defending player may play cards during the attacker's turn (none of which, in today's pool, change a die — the owner's correction).

### 6. Adopt the CR's words on the public pages

The CR says **Rival**, **Gig area**, **fixer area**, **roll in**, **adjust / increase / decrease**,
**set**, **swap**, **steal**, **owner / controller** (§1.7). The reference page's rule text says
"opponent" in places. Using the CR's terms is free and makes the citations read naturally.

## Smaller observations

- **§1.13.1 / §1.17.1** — simultaneous win or loss is a **tie**; the result box's "draw" already covers it.
- **§1.12, §1.14–§1.16** — alternate win conditions, decking out, and conceding end a game with no
  dice-state cause. These live in the result circle, as `docs/spec/notation.md` says; the checker will
  report such a game as "no winner yet", which is correct for dice state.
- **"Adjust … by up to N"** — the FAQ confirms choosing 0 still counts as adjusting, and §6.4.3 says an
  adjustment to the same value fails. Neither changes the board, so there is nothing to write down.
- **§5.10.2** — the Fixer is a _public_ area, so noting its contents is within the tournament rule
  that only objective, public information may be recorded.
- **§1.7.3.2** — pieces return to their owners at the end of the game; Die Owner / Controller in the
  glossary match §1.7.
