/**
 * What the printed scoresheet shows that comes from the notation itself, so the sheet's legend
 * and shading cannot drift from the validator: the legend is built from the same tables the
 * parser reads, and the overtime boundary is the one `analyzeDocument` enforces.
 */
import { OVERTIME_START, SOFT_CAP } from './game.ts';
import { Action, ACTION_NAME, DIE_LETTERS } from './notation.ts';

/**
 * Rows per game on the sheet: exactly the soft cap. A game that runs past it is warned about by the
 * checker, and nobody has played one that long — so the sheet does not spend paper on turns 17+.
 */
export const SHEET_ROWS = SOFT_CAP;

/** `A d4  B d6  C d8  D d10  E d12  F d20` */
export const diceLegend = Object.entries(DIE_LETTERS)
	.map(([letter, sides]) => `${letter} d${sides}`)
	.join('  ');

/** `' theirs  x steal  + - = ~ modify  <> swap  ( ) reaction  .. pass` */
export const moveLegend = [
	"' theirs",
	`${Action.Steal} ${ACTION_NAME[Action.Steal].toLowerCase()}`,
	`${[Action.Increment, Action.Decrement, Action.Set, Action.Reroll].join(' ')} modify`,
	`${Action.Swap} ${ACTION_NAME[Action.Swap].toLowerCase()}`,
	'( ) reaction',
	'.. pass'
].join('  ');

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
