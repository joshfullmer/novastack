import { Action, opponent } from './notation.ts';
import type { Owner } from './notation.ts';
import { initialState } from './state.ts';
import type { GameState } from './state.ts';
import { parseDocument } from './parse.ts';
import type { ParsedMove } from './parse.ts';
import { applyMove, validateMove } from './rules.ts';

export const WIN_DICE = 7;
export const OVERTIME_START = 15;
export const SOFT_CAP = 16;

export type ValidationError = { turn: number; raw: string; reason: string };

export type Outcome =
	| {
			kind: 'win';
			player: Owner;
			turn: number;
			/**
			 * `start` — held seven Gigs when their own turn began (§1.10). `overtime` — stole their way
			 * to seven in overtime (§1.11). `overtime-start` — already held seven when overtime began
			 * at the end of turn 14 (§1.11.2).
			 */
			how: 'start' | 'overtime' | 'overtime-start';
	  }
	| { kind: 'undecided' };

/**
 * One move as the validator saw it: who made it, the board it landed on, and why it was refused,
 * if it was. `before` is what lets a move be explained in the particular ("WE lowers their d6 from
 * 4 to 2") rather than only in general — the hover text reads it, and so does the error list.
 *
 * A refused move leaves the board untouched, so the next move's `before` is the same state.
 */
export type MoveReport = {
	move: ParsedMove;
	/** The player who made the move — already flipped for a reaction. */
	actor: Owner;
	reaction: boolean;
	before: GameState;
	/** Null when the move was legal and applied. */
	error: string | null;
};

export type TurnReport = {
	number: number;
	actor: Owner;
	raw: string;
	moves: MoveReport[];
	/** The board once the turn is over. */
	state: GameState;
};

export type GameReport = {
	first: Owner;
	turns: TurnReport[];
	state: GameState;
	errors: ValidationError[];
	warnings: string[];
	outcome: Outcome;
};

export function analyzeDocument(text: string): GameReport {
	const doc = parseDocument(text);
	const errors: ValidationError[] = [...doc.errors];
	const actorOf = (turn: number): Owner => (turn % 2 === 1 ? doc.first : opponent(doc.first));

	let state = initialState();
	let outcome: Outcome = { kind: 'undecided' };
	const turns: TurnReport[] = [];

	const checkTurnStart = (turn: number) => {
		const actor = actorOf(turn);
		if (state[actor].gigs.length >= WIN_DICE)
			outcome = { kind: 'win', player: actor, turn, how: 'start' };
	};

	for (const turn of doc.turns) {
		const actor = actorOf(turn.number);
		if (outcome.kind === 'undecided') checkTurnStart(turn.number);
		const fail = (raw: string, reason: string) => errors.push({ turn: turn.number, raw, reason });

		if (outcome.kind === 'win' && turn.entries.length === 0) fail('..', 'turn after game end');

		const moves: MoveReport[] = [];

		// §8.6.5: every Start Phase rolls in exactly one die from the Fixer while it has dice. A
		// blank line is already an error of its own, so it is not also "a turn with no Roll".
		const mustRoll =
			outcome.kind === 'undecided' &&
			state[actor].fixer.length > 0 &&
			!(turn.entries.length === 0 && turn.raw === '');
		let rolled = false;
		let attemptedRoll = false;

		for (const { move, reaction } of turn.entries) {
			const ctx = { actor: reaction ? opponent(actor) : actor, reaction };
			const record = (error: string | null) =>
				moves.push({ move, actor: ctx.actor, reaction, before: state, error });

			if (outcome.kind === 'win') {
				fail(move.raw, 'move after game end');
				record('move after game end');
				continue;
			}
			let error = validateMove(move, ctx, state);
			if (!error && !reaction && move.action === Action.Roll && rolled)
				error = 'Roll: only one die is rolled in per Turn';
			if (!reaction && move.action === Action.Roll) attemptedRoll = true;
			record(error);
			if (error) {
				fail(move.raw, error);
				continue;
			}
			if (!reaction && move.action === Action.Roll) rolled = true;
			state = applyMove(move, ctx, state);
			if (
				move.action === Action.Steal &&
				turn.number >= OVERTIME_START &&
				state[ctx.actor].gigs.length >= WIN_DICE
			)
				outcome = { kind: 'win', player: ctx.actor, turn: turn.number, how: 'overtime' };
		}

		if (mustRoll) {
			const lead = turn.entries.find((e) => !e.reaction)?.move;
			if (!attemptedRoll)
				fail(lead?.raw ?? '..', 'no Roll — a Turn begins with a Roll while the Fixer has dice');
			else if (lead && lead.action !== Action.Roll)
				fail(lead.raw, 'the Roll comes first — a Turn begins by rolling a die in');
		}

		// §1.11.2: overtime begins as turn 14 ends, and anyone already holding seven wins on the spot.
		// Both Fixers are empty by then — one die a turn, six each — so turn 15 is always the start of
		// overtime. Only the player who just moved can be newly there; the other's win is the ordinary
		// start-of-turn one a moment later.
		if (
			outcome.kind === 'undecided' &&
			turn.number === OVERTIME_START - 1 &&
			state[actor].gigs.length >= WIN_DICE
		)
			outcome = { kind: 'win', player: actor, turn: turn.number, how: 'overtime-start' };

		turns.push({ number: turn.number, actor, raw: turn.raw, moves, state });
	}

	// A win is declared at the start of a turn, so it can land on a row never written.
	if (outcome.kind === 'undecided') checkTurnStart(doc.turns.length + 1);

	const warnings: string[] = [];
	if (doc.turns.length > SOFT_CAP)
		warnings.push(`game ran ${doc.turns.length} turns; ${SOFT_CAP} is the soft cap`);

	errors.sort((a, b) => a.turn - b.turn);
	return { first: doc.first, turns, state, errors, warnings, outcome };
}
