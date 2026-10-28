import { describe, expect, it } from 'vitest';
import { analyzeDocument, describeMove } from './index.ts';
import type { ParsedMove } from './index.ts';
import { VALID_GAME } from './examples.ts';

const say = (doc: string, turn: number, index = 0) => {
	const m = analyzeDocument(doc).turns[turn - 1].moves[index];
	return describeMove(m.move, { actor: m.actor, reaction: m.reaction, before: m.before });
};

const bare = (raw: string) => {
	const move = analyzeDocument(raw).turns[0].moves[0].move;
	return describeMove(move);
};

describe('describeMove with a board', () => {
	it('names the actor and the roll', () => {
		expect(say('B4', 1)).toBe('WE rolls their d6; it shows 4.');
	});
	it('says what a decrement started from', () => {
		expect(say('B4 -B2', 1, 1)).toBe('WE lowers their d6 from 4 to 2.');
	});
	it('names the opponent as the actor on their turn', () => {
		expect(say("A4\nA'4 -A'1", 2, 1)).toBe('THEY lowers their d4 from 4 to 1.');
	});
	it('reads a steal off the board, since the notation writes no value', () => {
		expect(say('B3\nxB', 2)).toBe("THEY steals WE's d6, showing 3.");
	});
	it('says whose die a modifier touches when it is not the actor’s', () => {
		expect(say("A4\nA'4 -A1", 2, 1)).toBe("THEY lowers WE's d4 from 4 to 1.");
	});
	it('prefixes a reaction with the response', () => {
		expect(say("A4 -A1\nA'4 (-A'2)", 2, 1)).toBe("In response, WE lowers THEY's d4 from 4 to 2.");
	});
	it('names a reroll’s before and after', () => {
		expect(say('C7 ~C3', 1, 1)).toBe('WE rerolls their d8: 7 becomes 3.');
	});
	it('names both dice and what they show, the actor’s first', () => {
		expect(say("A4\nA'2\nB1 A'<>A", 3, 1)).toBe(
			"WE swaps their d4 (showing 4) with THEY's d4 (showing 2)."
		);
	});
	it('falls back to the general sentence when the die is not on the board', () => {
		const move = analyzeDocument('B4').turns[0].moves[0].move;
		const unseen: ParsedMove = { ...move, action: '-', value: 2 };
		const board = analyzeDocument('').state;
		expect(describeMove(unseen, { actor: 'w', reaction: false, before: board })).toBe(
			"Lower WE's d6 to 2."
		);
	});
});

describe('describeMove without a board', () => {
	it.each([
		['B4', "Roll WE's d6; it shows 4."],
		["xB'", "Steal THEY's d6; it keeps its value."],
		["xB'3", "Steal THEY's d6, which shows 3."],
		['+B5', "Raise WE's d6 to 5."],
		['-B2', "Lower WE's d6 to 2."],
		['=B3', "Set WE's d6 to 3."],
		['~B6', "Reroll WE's d6; it now shows 6."],
		["A<>B'", "Swap WE's d4 with THEY's d6; both keep their values."]
	])('%s', (raw, english) => expect(bare(raw)).toBe(english));
});

describe('the worked example', () => {
	it('explains every move in the valid game without a fallback to an error', () => {
		const report = analyzeDocument(VALID_GAME);
		for (const turn of report.turns)
			for (const m of turn.moves) {
				expect(m.error).toBeNull();
				expect(
					describeMove(m.move, { actor: m.actor, reaction: m.reaction, before: m.before })
				).toMatch(/\.$/);
			}
	});
});
