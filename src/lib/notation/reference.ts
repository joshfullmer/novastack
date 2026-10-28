/**
 * The reference page's source of truth (`/notation/reference`) — every worked example the page
 * shows, with the claim the page makes about it, and the prose that cannot be derived from the
 * validator's own constants.
 *
 * `reference.spec.ts` runs each example through `analyzeDocument` and checks the claim, so a
 * documented game that stops doing what the page says fails the build rather than going stale.
 * Numbers that *can* be derived (`WIN_DICE`, `OVERTIME_START`, the die letters, the action names and
 * symbols) are not written here: the page renders them from the lib, and the rule text below is
 * built from the same constants.
 */
import { INVALID_GAME, VALID_GAME } from './examples.ts';
import type { Outcome } from './game.ts';
import { OVERTIME_START, SOFT_CAP, WIN_DICE } from './game.ts';
import { Action, LETTER_OF, SIDES } from './notation.ts';

/** What a worked example promises. Anything left out is not claimed. */
export type Claim = {
	/** How many errors the checker reports. Defaults to none. */
	errors?: number;
	/** The turn of each error, in order. */
	errorTurns?: number[];
	outcome?: Outcome;
	/** The Gigs each player ends with, as `formatGig` writes them. */
	gigs?: { w?: string[]; t?: string[] };
	/** How many Gigs each player ends with, for a board too crowded to list. */
	counts?: { w?: number; t?: number };
};

export type Example = { id: string; transcript: string; claim: Claim };

const lines = (...turns: string[]) => turns.join('\n');

/** The worked game cut off after turn 9, before THEY's turn 10 — so nothing declares the win. */
const WITHOUT_LAST_TURN = VALID_GAME.split('\n').slice(0, 10).join('\n');

/**
 * Both players roll in one die a turn, so after twelve turns each has all six in play and both Fixers
 * are empty — which is why turn 15 is always the start of overtime. Two passes follow (a pass is only
 * possible with an empty Fixer), then WE steals a sixth-plus-one die and wins on the spot. Built from
 * the constants so the example follows them.
 */
const OVERTIME_GAME = (() => {
	const turns: string[] = [];
	for (const sides of SIDES) turns.push(`${LETTER_OF[sides]}1`, `${LETTER_OF[sides]}'1`);
	while (turns.length < OVERTIME_START - 1) turns.push('..');
	turns.push("xA'");
	return turns.map((line, i) => `${i + 1}| ${line}`).join('\n');
})();

export const EXAMPLES: readonly Example[] = [
	{
		id: 'valid-game',
		transcript: VALID_GAME,
		claim: {
			outcome: { kind: 'win', player: 'w', turn: 11, how: 'start' },
			gigs: {
				w: ['A1', 'B1', 'D4', "B'1", "A'4", 'E7', "C'3", "D'4"],
				t: ['C8', "E'12"]
			}
		}
	},
	{
		id: 'invalid-game',
		transcript: INVALID_GAME,
		claim: { errors: 8, errorTurns: [3, 5, 6, 7, 8, 9, 10, 11], outcome: { kind: 'undecided' } }
	},
	{
		id: 'undecided',
		transcript: WITHOUT_LAST_TURN,
		claim: { outcome: { kind: 'undecided' }, counts: { w: WIN_DICE + 1, t: 1 } }
	},
	{
		id: 'overtime',
		transcript: OVERTIME_GAME,
		claim: {
			outcome: { kind: 'win', player: 'w', turn: OVERTIME_START, how: 'overtime' },
			counts: { w: WIN_DICE, t: SIDES.length - 1 }
		}
	},
	{
		id: 'turn-order',
		transcript: lines('first: THEY', "A'3", 'A2'),
		claim: { gigs: { w: ['A2'], t: ["A'3"] } }
	},
	{
		id: 'reaction',
		transcript: lines('A4', "A'4", "B4 (-A'2)"),
		claim: { gigs: { w: ['A4', 'B4'], t: ["A'2"] } }
	},
	{
		id: 'steal-then-change',
		transcript: lines('B3', "A'4 xB -B2"),
		claim: { gigs: { w: [], t: ["A'4", 'B2'] } }
	}
];

export function example(id: string): Example {
	const found = EXAMPLES.find((e) => e.id === id);
	if (!found) throw new Error(`no reference example "${id}"`);
	return found;
}

/**
 * One demo per move: the Turns before it (so the demo falls on a Turn its player owns) and the
 * move itself. Prose here is the legality column of the page's move table.
 */
export type MoveDoc = {
	action: Action;
	/** What the move does. */
	effect: string;
	/** When it is legal. */
	legal: string;
	setup: string[];
	demo: string;
	claim: Claim;
};

const D20 = SIDES[SIDES.length - 1];

export const MOVES: readonly MoveDoc[] = [
	{
		action: Action.Roll,
		effect: "A die leaves the actor's Fixer and joins their Gigs, showing the written value.",
		legal: `The die is the actor's own and still in their Fixer. Exactly one a Turn, and first, while the Fixer has dice. The d${D20} only when it is the last die left.`,
		setup: [],
		demo: 'A3',
		claim: { gigs: { w: ['A3'], t: [] } }
	},
	{
		action: Action.Steal,
		effect: "A die moves from the Rival's Gigs to the actor's; its value comes with it.",
		legal:
			"The die is in the Rival's Gigs. The value is optional; if written it must match the die's current one.",
		setup: ['B3'],
		demo: "A'4 xB",
		claim: { gigs: { w: [], t: ["A'4", 'B3'] } }
	},
	{
		action: Action.Increment,
		effect: "A Gig die's value rises to the written one.",
		legal:
			'The die is in someone’s Gigs. The new value is higher than the current one and fits the die.',
		setup: ['B3', "A'4"],
		demo: 'A4 +B5',
		claim: { gigs: { w: ['B5', 'A4'], t: ["A'4"] } }
	},
	{
		action: Action.Decrement,
		effect: "A Gig die's value falls to the written one.",
		legal:
			'The die is in someone’s Gigs. The new value is lower than the current one and at least 1.',
		setup: ['B4', "A'4"],
		demo: 'A4 -B2',
		claim: { gigs: { w: ['B2', 'A4'], t: ["A'4"] } }
	},
	{
		action: Action.Set,
		effect: "A Gig die's value becomes the written one, whatever it was.",
		legal:
			'The die is in someone’s Gigs. The new value fits the die; it may equal the current one.',
		setup: ['C7', "A'4"],
		demo: 'A4 =C4',
		claim: { gigs: { w: ['C4', 'A4'], t: ["A'4"] } }
	},
	{
		action: Action.Reroll,
		effect: 'The same as Set, recorded as a reroll: the new value is the result of the roll.',
		legal: 'The same as Set. It differs only in provenance.',
		setup: ['C7', "A'4"],
		demo: 'A4 ~C3',
		claim: { gigs: { w: ['C3', 'A4'], t: ["A'4"] } }
	},
	{
		action: Action.Swap,
		effect:
			"One die from each side's Gigs trade places at once. Both keep their values, and a swap is not a Steal.",
		legal:
			'One of the two dice is in the actor’s Gigs and the other in the Rival’s, in either order. There is no value to write.',
		setup: ['A3', "A'4"],
		demo: "B2 A<>A'",
		claim: { gigs: { w: ['B2', "A'4"], t: ['A3'] } }
	}
];

/**
 * A game rule the checker enforces, with the Comprehensive Rules section that backs it. `cr` is
 * `null` while a rule is unverified — the page shows a pending chip for a `null`, and nothing here
 * pretends to a section number. A citation means the rule's text was checked against that section of
 * the CR as it stood on 2026-10-28 (the audit is `docs/research/notation-cr-audit.md`).
 *
 * Notation conventions — how a Transcript is *written*, not how the game is played — are in
 * `CONVENTIONS`, with no citation to find.
 */
export type Rule = { id: string; text: string; cr: string | null };

export const RULES: readonly Rule[] = [
	{
		id: 'roll-in',
		text: 'Every Turn begins with exactly one Roll — a die rolled in from your own Fixer — while your Fixer has dice. Once it is empty there is nothing to roll in, and a Turn may be a pass.',
		cr: '§8.6, §8.6.5'
	},
	{
		id: 'roll-own',
		text: 'A die is rolled only by its own player, and only from their Fixer.',
		cr: '§8.6.5, §1.7.1'
	},
	{
		id: 'd20-last',
		text: `The d${D20} may only be rolled when it is the last die left in the Fixer.`,
		cr: '§8.6.5.1.1'
	},
	{
		id: 'steal-from-rival',
		text: 'A Steal takes a die from the Rival’s Gigs only; the die keeps its value.',
		cr: '§6.8, §11.5.1.2'
	},
	{
		id: 'modify-in-gigs',
		text: 'Increment, Decrement, Set and Reroll act on a die in anyone’s Gigs, including one the Rival controls.',
		cr: '§6.4, §6.5, §6.1.4'
	},
	{
		id: 'swap',
		text: 'A Swap exchanges one die in your Gigs with one in your Rival’s. Both keep their values, and a Swap is not a Steal.',
		cr: '§6.7, §6.7.1, §6.7.2'
	},
	{
		id: 'value-bounds',
		text: 'Every value is from 1 to the die’s sides. Increment must raise the value; Decrement must lower it.',
		cr: '§6.3.3, §6.4.3, §6.5.1'
	},
	{
		id: 'turn-order',
		text: 'Turns alternate, starting with whoever went first. Odd turns are theirs.',
		cr: '§7.5.2, §8.18'
	},
	{
		id: 'win-regulation',
		text: `A player who starts their own Turn controlling ${WIN_DICE} or more Gigs wins.`,
		cr: '§1.10, §8.6.1'
	},
	{
		id: 'win-overtime',
		text: `Overtime begins as turn ${OVERTIME_START - 1} ends — one die a turn, six each, has emptied both Fixers. From then on a Steal that brings the actor to ${WIN_DICE} Gigs wins immediately, and a player already holding ${WIN_DICE} when it begins wins at once.`,
		cr: '§1.11, §1.11.1, §1.11.2, §8.17'
	}
];

/** How a Transcript is written. The checker enforces these, but no rulebook is the authority. */
export const CONVENTIONS: readonly string[] = [
	'A blank line mid-game is an error, never a pass. A pass is written `..`.',
	'Comment-only lines are not Turns; a `;` starts a comment that runs to the end of the line.',
	'The checker declares a win only at the start of the Turn immediately after the last one written. If the Rival’s intervening Turn is missing, the outcome is undecided.',
	'Any move or pass written after the game has ended is an error.',
	'A turn number, if written, must match its line’s position.',
	`A game longer than ${SOFT_CAP} turns is warned about, not rejected. Nothing in the rules sets a limit; the warning is a guard against a typo.`,
	'Draws, concessions and time are not dice state. They live in the scoresheet’s result box.'
];

/** The four design questions people ask, in the order they ask them. */
export const DESIGN_NOTES: readonly { title: string; body: string }[] = [
	{
		title: 'Why letters for dice',
		body: 'A digit die next to a digit value (`63`) is unreadable in ink. A letter always leads a move, so `B3` cannot be misread, and B versus 8 is settled by position.'
	},
	{
		title: 'Why the prime is relative to the sheet’s author',
		body: 'In a best of three the loser chooses who goes first, so an absolute scheme would flip the prime between games on one sheet. Two players’ sheets of the same game differ by a consistent prime flip plus the `first:` circle, so one can be normalised to the other.'
	},
	{
		title: 'Why + and − survive although they are derivable',
		body: 'They are checksums. A `+` on a die that went down is a transcription error, caught on the spot.'
	},
	{
		title: 'Why no value on a steal',
		body: 'The die keeps its value. One may be written as a checksum and must match. An effect that changes the value on a steal is a separate move: `xB -B2`.'
	}
];

/** The grammar, as a code block. The one piece of the page that is not generated from the lib. */
export const GRAMMAR = `document := header? turn*
header   := "first:" ("WE" | "THEY")          ; optional, default WE
turn     := prefix? ( entry+ | ".." )         ; one turn per line; ".." = pass
prefix   := number ("|" | ".")?               ; optional, must match line position
entry    := move | "(" move+ ")"              ; parenthesised = reaction by the other player
move     := swap | action? die owner? value?
swap     := die owner? "<>" die owner?        ; two dice, no value; either order
action   := "x" | "+" | "-" | "=" | "~"       ; absent = roll
die      := "A" | "B" | "C" | "D" | "E" | "F"
owner    := "'"                               ; THEY's die; absent = WE's
value    := 1..20                             ; required except on a steal
comment  := ";" to end of line                ; ignored`;
