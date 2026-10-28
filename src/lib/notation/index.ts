/**
 * Nova Notation's public entry point: transcript text in, a per-turn, per-move report out.
 * Pure — no DOM, no dataset — so the same code runs at build time (the reference page's asserted
 * examples), in the browser (the checker) and under test.
 */
export { analyzeDocument, WIN_DICE, OVERTIME_START, SOFT_CAP } from './game.ts';
export type { GameReport, MoveReport, Outcome, TurnReport, ValidationError } from './game.ts';
export { describeMove, SYNTAX_HELP } from './describe.ts';
export type { DescribeContext, SyntaxKind } from './describe.ts';
export {
	Action,
	ACTION_NAME,
	DIE_LETTERS,
	LETTER_OF,
	PLAYER_LABEL,
	SIDES,
	formatDie,
	formatGig,
	opponent,
	sameDie
} from './notation.ts';
export type { Die, DieLetter, Gig, Owner, Sides } from './notation.ts';
export { initialState } from './state.ts';
export type { GameState, PlayerState } from './state.ts';
export { parseMove } from './parse.ts';
export type { ParsedMove } from './parse.ts';
export { splitTurn } from './parse.ts';
export { narrateTurn } from './narrate.ts';
