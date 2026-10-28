/**
 * A turn, told the way a player would tell it across the table: *"I rolled my d10 and it rolled a
 * 6. Then I lowered my d10 from 6 to 4. Then I stole my Rival's d6 and d4."*
 *
 * The other register of `describeMove`. That one is for a tooltip on a single token and speaks the
 * notation's own vocabulary (WE, THEY) so it can be matched against the sheet; this one is for an
 * introduction, where WE and THEY are exactly the jargon the reader has not learned yet. The sheet's
 * author is "I" and the opponent is "my Rival" — the game's own word for them — so it reads from
 * the author's chair, which is the only chair a scoresheet has.
 *
 * Reads the same `MoveReport`s the validator produced, so it cannot say something the checker
 * would not. A move the checker refused, or one naming a die the board cannot find, drops back to
 * `describeMove`'s general sentence rather than inventing a value.
 */
import { describeMove } from './describe.ts';
import { Action } from './notation.ts';
import type { Owner } from './notation.ts';
import { findGig } from './state.ts';
import type { MoveReport, TurnReport } from './game.ts';

const SUBJECT: Record<Owner, string> = { w: 'I', t: 'my Rival' };
const OWN: Record<Owner, string> = { w: 'my', t: 'their' };

/** Whose die it is, from the actor's chair: "my", "their" (the Rival's own), or "my Rival's". */
const possessive = (holder: Owner, actor: Owner) =>
	holder === actor ? OWN[actor] : holder === 'w' ? 'my' : "my Rival's";

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

const article = (value: number) => (value === 8 || value === 11 || value === 18 ? 'an' : 'a');

type Clause =
	| { kind: 'sentence'; text: string }
	| {
			kind: 'move';
			actor: Owner;
			reaction: boolean;
			predicate: string;
			/** Consecutive steals from one side are told as one: "stole my Rival's d6 and d4". */
			steal?: { from: string; dice: string[] };
	  };

function clauseFor(report: MoveReport): Clause {
	const { move, actor, reaction, before } = report;
	const { action, die, value = 0 } = report.move;
	const d = `d${die.sides}`;
	const loc = findGig(before, die);

	if (report.error || (action !== Action.Roll && !loc)) {
		return { kind: 'sentence', text: describeMove(move) };
	}

	if (action === Action.Roll) {
		return {
			kind: 'move',
			actor,
			reaction,
			predicate: `rolled ${possessive(die.owner, actor)} ${d} and it rolled ${article(value)} ${value}`
		};
	}

	if (action === Action.Swap) {
		const other = findGig(before, move.with!);
		if (!other || other.holder === loc!.holder)
			return { kind: 'sentence', text: describeMove(move) };
		// The actor's die first, whichever way round the pair was written.
		const [mine, theirs] = loc!.holder === actor ? [loc!, other] : [other, loc!];
		return {
			kind: 'move',
			actor,
			reaction,
			predicate: `swapped ${possessive(mine.holder, actor)} d${mine.gig.sides} for ${possessive(theirs.holder, actor)} d${theirs.gig.sides}`
		};
	}

	const holder = loc!.holder;
	const mine = `${possessive(holder, actor)} ${d}`;
	const from = loc!.gig.value;

	switch (action) {
		case Action.Steal:
			return {
				kind: 'move',
				actor,
				reaction,
				predicate: '',
				steal: { from: possessive(holder, actor), dice: [d] }
			};
		case Action.Increment:
			return {
				kind: 'move',
				actor,
				reaction,
				predicate: `raised ${mine} from ${from} to ${value}`
			};
		case Action.Decrement:
			return {
				kind: 'move',
				actor,
				reaction,
				predicate: `lowered ${mine} from ${from} to ${value}`
			};
		case Action.Set:
			return { kind: 'move', actor, reaction, predicate: `set ${mine} to ${value}` };
		default:
			return {
				kind: 'move',
				actor,
				reaction,
				predicate: `rerolled ${mine} and it rolled ${article(value)} ${value}`
			};
	}
}

/** "d6", "d6 and d4", "d6, d4 and d8". */
const list = (items: string[]) =>
	items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export function narrateTurn(turn: TurnReport): string {
	if (turn.moves.length === 0) return `${capital(SUBJECT[turn.actor])} passed.`;

	const clauses: Clause[] = [];
	for (const report of turn.moves) {
		const next = clauseFor(report);
		const last = clauses.at(-1);
		if (
			next.kind === 'move' &&
			next.steal &&
			last?.kind === 'move' &&
			last.steal &&
			last.actor === next.actor &&
			last.reaction === next.reaction &&
			last.steal.from === next.steal.from
		)
			last.steal.dice.push(...next.steal.dice);
		else clauses.push(next);
	}

	return clauses
		.map((clause, i) => {
			if (clause.kind === 'sentence') return clause.text;
			const predicate = clause.steal
				? `stole ${clause.steal.from} ${list(clause.steal.dice)}`
				: clause.predicate;
			const subject = SUBJECT[clause.actor];
			if (clause.reaction) return `In response, ${subject} ${predicate}.`;
			if (i === 0) return `${capital(subject)} ${predicate}.`;
			return `Then ${subject} ${predicate}.`;
		})
		.join(' ');
}
