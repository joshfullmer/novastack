import { describe, expect, it } from 'vitest';
import { OVERTIME_START, SOFT_CAP } from './game.ts';
import { parseMove } from './parse.ts';
import { actionKey, anatomy, diceKey, sheetRows } from './scoresheet.ts';

describe('the scoresheet', () => {
	it('prints every die letter with its sides', () => {
		expect(diceKey.map(({ letter, sides }) => `${letter} d${sides}`).join('  ')).toBe(
			'A d4  B d6  C d8  D d10  E d12  F d20'
		);
	});
	it('gives every action an example the parser reads as that action', () => {
		expect(actionKey.map(({ name }) => name)).toEqual([
			'roll',
			'steal',
			'increment',
			'decrement',
			'set',
			'reroll',
			'swap'
		]);
	});
	it('takes apart a move that parses as what it says', () => {
		const move = parseMove(anatomy.parts.map(({ text }) => text).join(''));
		expect(move).toMatchObject({ action: '=', die: { sides: 10, owner: 't' }, value: 3 });
		expect(anatomy.says).toBe('Set their d10 to 3');
	});
	it('has exactly as many rows as the soft cap, overtime starting where the validator puts it', () => {
		expect(sheetRows).toHaveLength(SOFT_CAP);
		expect(sheetRows.filter((r) => r.overtime).map((r) => r.turn)).toEqual([15, 16]);
		expect(sheetRows.find((r) => r.overtime)?.turn).toBe(OVERTIME_START);
	});
	it('shades odd turns', () => {
		expect(sheetRows.slice(0, 4).map((r) => r.shaded)).toEqual([true, false, true, false]);
	});
});
