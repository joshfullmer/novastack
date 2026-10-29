/**
 * What the printed scoresheet shows that comes from the notation itself, so the sheet's key
 * and shading cannot drift from the validator: the key is built from the same tables the
 * parser reads, and the overtime boundary is the one `analyzeDocument` enforces.
 */
import { OVERTIME_START, SOFT_CAP } from './game.ts';
import { ACTION_NAME, DIE_LETTERS } from './notation.ts';
import { parseMove } from './parse.ts';

/**
 * Rows per game on the sheet: exactly the soft cap. A game that runs past it is warned about by the
 * checker, and nobody has played one that long — so the sheet does not spend paper on turns 17+.
 */
export const SHEET_ROWS = SOFT_CAP;

/** One entry per die: `A` `4`, `B` `6`, … */
export const diceKey = Object.entries(DIE_LETTERS).map(([letter, sides]) => ({ letter, sides }));

/**
 * An example move for every action, named as the checker names it: `B4` roll, `xB'` steal, `+B5`
 * increment … Reactions are left out — no card in the current pool changes a die in the React Step.
 */
export const actionKey = ['B4', "xB'", '+B5', '-B2', '=B3', '~B6', "A<>B'"].map((code) => ({
	code,
	name: ACTION_NAME[parseMove(code)!.action].toLowerCase()
}));

/** A move taken apart for the key: each piece with what it is, and what the whole says. */
export const anatomy = {
	parts: [
		{ text: '=', label: 'action' },
		{ text: 'D', label: 'die' },
		{ text: "'", label: 'theirs' },
		{ text: '3', label: 'value' }
	],
	says: 'Set their d10 to 3'
};

export type SheetRow = { turn: number; overtime: boolean; shaded: boolean };

/** The numbered rows of one game column. Odd rows are lightly shaded; overtime rows more so. */
export const sheetRows: SheetRow[] = Array.from({ length: SHEET_ROWS }, (_, i) => {
	const turn = i + 1;
	return {
		turn,
		overtime: turn >= OVERTIME_START,
		shaded: turn % 2 === 1
	};
});
