import { describe, expect, it } from 'vitest';
import { analyzeDocument, narrateTurn } from './index.ts';
import { VALID_GAME } from './examples.ts';

const tell = (doc: string, turn: number) => narrateTurn(analyzeDocument(doc).turns[turn - 1]);

describe('narrateTurn', () => {
	it('tells a roll the way a player would', () => {
		expect(tell('B4', 1)).toBe('I rolled my d6 and it rolled a 4.');
	});
	it('says "an" before an 8, an 11 and an 18', () => {
		expect(tell('C8', 1)).toBe('I rolled my d8 and it rolled an 8.');
		expect(tell('E11', 1)).toBe('I rolled my d12 and it rolled an 11.');
	});
	it('chains the moves of a turn with "Then"', () => {
		expect(tell('B4 -B2', 1)).toBe(
			'I rolled my d6 and it rolled a 4. Then I lowered my d6 from 4 to 2.'
		);
	});
	it('speaks of the opponent as my Rival', () => {
		expect(tell("A4\nA'3", 2)).toBe('My Rival rolled their d4 and it rolled a 3.');
	});
	it('names whose die a steal takes', () => {
		expect(tell("A4\nA'3 xA", 2)).toBe(
			'My Rival rolled their d4 and it rolled a 3. Then my Rival stole my d4.'
		);
		expect(tell("A4\nA'3\nB4 xA'", 3)).toBe(
			"I rolled my d6 and it rolled a 4. Then I stole my Rival's d4."
		);
	});
	it('folds consecutive steals from one side into one', () => {
		expect(tell(VALID_GAME, 7)).toBe(
			"I rolled my d10 and it rolled a 6. Then I lowered my d10 from 6 to 4. Then I stole my Rival's d6 and d4."
		);
	});
	it('tells a swap from the actor’s chair', () => {
		expect(tell("A4\nA'2\nB1 A<>A'", 3)).toBe(
			"I rolled my d6 and it rolled a 1. Then I swapped my d4 for my Rival's d4."
		);
		expect(tell("A4\nA'2 A'<>A", 2)).toBe(
			'My Rival rolled their d4 and it rolled a 2. Then my Rival swapped their d4 for my d4.'
		);
	});
	it('says whose die a modifier touches when it is not the actor’s', () => {
		expect(tell("A4\nA'4 -A1", 2)).toContain('lowered my d4 from 4 to 1');
	});
	it('still tells a reaction, as a response', () => {
		expect(tell("A4 -A1\nA'4 (-A'2)", 2)).toBe(
			"My Rival rolled their d4 and it rolled a 4. In response, I lowered my Rival's d4 from 4 to 2."
		);
	});
	it('tells a pass', () => {
		expect(tell('..', 1)).toBe('I passed.');
		expect(tell('A4\n..', 2)).toBe('My Rival passed.');
	});
	it('falls back to the general sentence for a move the checker refused', () => {
		expect(tell('+B5', 1)).toBe("Raise WE's d6 to 5.");
	});
});
