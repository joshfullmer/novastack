/**
 * A move, in English — the text behind every hover on a piece of notation.
 *
 * One function, two registers. **With a context** — who made the move and the board it landed on —
 * the sentence is specific: `WE lowers their d6 from 4 to 2.` That names the actor, which the
 * notation never writes and a newcomer cannot infer, and it states the before and after values,
 * which is the `+`/`-` checksum made readable. **Without one** — an isolated `xB'` in a reference
 * table — it falls back to the general rule: `Steal THEY's d6; it keeps its value.`
 *
 * A move that names a die the board cannot find (an illegal one, or a fragment shown with a
 * context that doesn't contain it) degrades to the general sentence rather than inventing a value.
 * Whether a move is *legal* is `validateMove`'s business, not this file's; callers that have an
 * error show it instead.
 */
import { Action, PLAYER_LABEL, opponent } from './notation.ts';
import type { Die, Owner } from './notation.ts';
import type { ParsedMove } from './parse.ts';
import { findGig } from './state.ts';
import type { GameState } from './state.ts';

export type DescribeContext = {
	/** The player who made the move — already flipped for a reaction. */
	actor: Owner;
	reaction: boolean;
	/** The board immediately before the move. */
	before: GameState;
};

/** `d6` — the owner is carried by whoever the sentence attaches the die to. */
const dieName = (die: Die) => `d${die.sides}`;

/** "their" when the die sits with the actor, otherwise the holder's name: `THEY's`. */
const possessive = (holder: Owner, actor: Owner) =>
	holder === actor ? 'their' : `${PLAYER_LABEL[holder]}'s`;

/** The general sentence: the die is named by its owner, since that is all a bare token says. */
function describeGeneral(move: ParsedMove): string {
	const { action, die, value } = move;
	const subject = `${PLAYER_LABEL[die.owner]}'s ${dieName(die)}`;
	switch (action) {
		case Action.Roll:
			return `Roll ${subject}; it shows ${value}.`;
		case Action.Steal:
			return value === undefined
				? `Steal ${subject}; it keeps its value.`
				: `Steal ${subject}, which shows ${value}.`;
		case Action.Increment:
			return `Raise ${subject} to ${value}.`;
		case Action.Decrement:
			return `Lower ${subject} to ${value}.`;
		case Action.Set:
			return `Set ${subject} to ${value}.`;
		case Action.Reroll:
			return `Reroll ${subject}; it now shows ${value}.`;
		case Action.Swap: {
			const other = move.with!;
			return `Swap ${subject} with ${PLAYER_LABEL[other.owner]}'s ${dieName(other)}; both keep their values.`;
		}
	}
}

export function describeMove(move: ParsedMove, context?: DescribeContext): string {
	if (!context) return describeGeneral(move);

	const { action, die, value } = move;
	const { actor, reaction, before } = context;
	const who = PLAYER_LABEL[actor];
	const loc = findGig(before, die);

	let sentence: string;
	if (action === Action.Roll) {
		sentence = `${who} rolls ${possessive(die.owner, actor)} ${dieName(die)}; it shows ${value}.`;
	} else if (action === Action.Swap) {
		// Named from the actor's chair: their die first, whichever way round it was written.
		const first = findGig(before, die);
		const second = findGig(before, move.with!);
		if (!first || !second || first.holder === second.holder) return describeGeneral(move);
		const [mine, theirs] = first.holder === actor ? [first, second] : [second, first];
		sentence = `${who} swaps their ${dieName(mine.gig)} (showing ${mine.gig.value}) with ${PLAYER_LABEL[opponent(actor)]}'s ${dieName(theirs.gig)} (showing ${theirs.gig.value}).`;
	} else if (!loc) {
		return describeGeneral(move);
	} else if (action === Action.Steal) {
		const from = PLAYER_LABEL[opponent(actor)];
		sentence = `${who} steals ${from}'s ${dieName(die)}, showing ${loc.gig.value}.`;
	} else {
		const target = `${possessive(loc.holder, actor)} ${dieName(die)}`;
		const from = loc.gig.value;
		const verb = {
			[Action.Increment]: 'raises',
			[Action.Decrement]: 'lowers',
			[Action.Set]: 'sets',
			[Action.Reroll]: 'rerolls'
		}[action];
		sentence =
			action === Action.Reroll
				? `${who} rerolls ${target}: ${from} becomes ${value}.`
				: `${who} ${verb} ${target} from ${from} to ${value}.`;
	}

	return reaction ? `In response, ${sentence}` : sentence;
}

/**
 * What the non-move pieces of a line mean, for the same hover. Keyed by what the token is, not by
 * its text: `3|` and `12.` are both a `prefix`.
 */
export const SYNTAX_HELP = {
	header: 'Who took turn 1. Optional; without it, WE went first.',
	prefix:
		'The turn number. Printed on the scoresheet, optional when typing; it must match the line.',
	pass: 'A pass: this player did nothing this turn. A blank line is an error, never a pass.',
	reaction:
		'A reaction: the other player acted during this turn, in the React Step, right where it resolved.',
	comment: 'A note to yourself. The checker ignores everything after a semicolon.'
} as const;
export type SyntaxKind = keyof typeof SYNTAX_HELP;
