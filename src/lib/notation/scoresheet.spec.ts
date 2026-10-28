import { describe, expect, it } from 'vitest';
import { OVERTIME_START, SOFT_CAP } from './game.ts';
import { diceLegend, moveLegend, sheetRows } from './scoresheet.ts';

describe('the scoresheet', () => {
	it('prints every die letter with its sides', () => {
		expect(diceLegend).toBe('A d4  B d6  C d8  D d10  E d12  F d20');
	});
	it('prints every action symbol the parser accepts', () => {
		expect(moveLegend).toBe("' theirs  x steal  + - = ~ modify  <> swap  ( ) reaction  .. pass");
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
