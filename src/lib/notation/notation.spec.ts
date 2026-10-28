import { describe, it, expect } from 'vitest';
import { analyzeDocument as analyzeStrict, formatGig } from './index.ts';
import type { GameReport, Owner } from './index.ts';
import { VALID_GAME, INVALID_GAME } from './examples.ts';

const lines = (...turns: string[]) => turns.join('\n');

/**
 * The checker, minus its roll-in rule (§8.6.5: one Roll, first, every turn while the Fixer has dice).
 *
 * Most tests here are about one *other* rule and are written as the shortest transcript that shows
 * it — `lines('A4', 'xA')` — which a real game would never be. This shadows `analyzeDocument` so they
 * can stay that short; the roll-in rule has its own tests below, against `analyzeStrict`.
 */
const ROLL_IN = /^(no Roll —|the Roll comes first —|Roll: only one die is rolled in)/;
const analyzeDocument = (text: string): GameReport => {
	const report = analyzeStrict(text);
	return { ...report, errors: report.errors.filter((e) => !ROLL_IN.test(e.reason)) };
};
const ok = (doc: string) => expect(analyzeDocument(doc).errors).toEqual([]);
const err = (doc: string, turn: number, reason: string) =>
	expect(analyzeDocument(doc).errors).toContainEqual(expect.objectContaining({ turn, reason }));
const gigs = (report: GameReport, player: Owner) => report.state[player].gigs.map(formatGig);
const fixer = (report: GameReport, player: Owner) =>
	report.state[player].fixer.map((d) => formatGig({ ...d, value: 0 }).slice(0, -1));

/** WE (odd turns) rolls A–E while THEY passes; ends after turn 9 with WE holding 5 gigs. */
const WE_ROLLS_FIVE = ['A1', '..', 'B1', '..', 'C1', '..', 'D1', '..', 'E1'];

describe('parse', () => {
	it('accepts an empty document', () => {
		const report = analyzeDocument('');
		expect(report.errors).toEqual([]);
		expect(report.turns).toHaveLength(0);
		expect(report.outcome).toEqual({ kind: 'undecided' });
	});
	it('ignores trailing comments and comment-only lines', () => {
		const report = analyzeDocument(lines('; a note', 'A4 ; rolled high', '; another', "A'2"));
		expect(report.errors).toEqual([]);
		expect(report.turns).toHaveLength(2);
	});
	it('ignores surrounding blank lines and whitespace', () =>
		ok(lines('', '  A4  ', "  A'2", '', '')));
	it('rejects invalid move syntax', () => err('GARBAGE', 1, 'invalid move syntax'));
	it('rejects a lowercase die letter', () => err('a4', 1, 'invalid move syntax'));
	it('requires a value on non-steal moves', () => err('A', 1, 'missing value'));
	it('collects errors across turns without halting', () => {
		expect(analyzeDocument(lines('GARBAGE', 'MORE')).errors).toHaveLength(2);
	});

	describe('header', () => {
		it('defaults first player to WE', () => {
			expect(analyzeDocument('A4').first).toBe('w');
		});
		it('reads first: THEY', () => {
			const report = analyzeDocument(lines('first: THEY', "A'4", 'A4'));
			expect(report.first).toBe('t');
			expect(report.errors).toEqual([]);
		});
		it('is case-insensitive', () => {
			expect(analyzeDocument(lines('FIRST: they', "A'4")).errors).toEqual([]);
		});
		it('does not count as a turn', () => {
			expect(analyzeDocument(lines('first: WE', 'A4')).turns).toHaveLength(1);
		});
	});

	describe('turn prefix', () => {
		it.each(['1| A4', '1. A4', '1 A4', '1|A4'])('accepts %s', (line) => ok(lines(line, "2| A'2")));
		it('rejects a number that does not match position', () =>
			err(lines('1| A4', "3| A'2"), 2, 'turn number 3 does not match position 2'));
	});

	describe('pass and blank lines', () => {
		it('accepts .. as a pass', () => ok(lines('..', "A'2")));
		it('rejects .. mixed with moves', () => err('A4 ..', 1, '.. must be the only entry in a turn'));
		it('flags a blank line mid-game but keeps turn alignment', () => {
			const report = analyzeDocument(lines('A4', '', 'B4'));
			expect(report.errors).toEqual([
				expect.objectContaining({ turn: 2, reason: 'empty turn — write .. to pass' })
			]);
			expect(report.turns[2].actor).toBe('w');
		});
	});

	describe('parentheses', () => {
		it('rejects nesting', () => err('A4 ((-A2))', 1, 'reactions cannot nest'));
		it('rejects unmatched )', () => err('A4 )', 1, 'unmatched )'));
		it('rejects unclosed (', () => err('A4 (-A2', 1, 'unclosed ('));
		it('rejects an empty reaction', () => err('A4 ()', 1, 'empty reaction'));
	});
});

describe('roll', () => {
	it('valid roll', () => ok('A4'));
	it("rejects rolling the opponent's die", () => err("A'4", 1, "Roll: A' is not WE's die"));
	it('rejects rolling a die already in gigs', () =>
		err(lines('A4', '..', 'A3'), 3, 'Roll: A is not in the fixer'));
	it('rejects value 0', () => err('B0', 1, 'Roll: value 0 out of range (1–6)'));
	it('rejects value above sides', () => err('A5', 1, 'Roll: value 5 out of range (1–4)'));
	it('accepts min and max', () => ok(lines('A1', "A'4")));
	it('rejects d20 while other dice remain in the fixer', () =>
		err('F10', 1, 'Roll: d20 must be the last die in the fixer'));
	it('allows d20 once it is the last die in the fixer', () =>
		ok(lines(...WE_ROLLS_FIVE, '..', 'F20')));
	it('allows d20 even if one of the other dice was stolen', () =>
		ok(lines(...WE_ROLLS_FIVE, 'xE', 'F20')));
});

describe('steal', () => {
	it('valid steal', () => ok(lines('A4', 'xA')));
	it('rejects stealing from the fixer', () => err("xA'", 1, "Steal: A' is not in THEY's gigs"));
	it('rejects stealing a die you already control', () =>
		err(lines('A4', '..', 'xA'), 3, "Steal: A is not in THEY's gigs"));
	it('allows stealing your own die back', () => ok(lines('A4', 'xA', 'xA')));
	it('keeps the value', () => {
		const report = analyzeDocument(lines('B3', 'xB'));
		expect(gigs(report, 't')).toEqual(['B3']);
		expect(gigs(report, 'w')).toEqual([]);
	});
	it('accepts a matching checksum value', () => ok(lines('B3', 'xB3')));
	it('rejects a mismatched checksum value', () =>
		err(lines('B3', 'xB2'), 2, 'Steal: B is 3, not 2'));
	it('stolen die is usable by the new controller', () => ok(lines('B3', 'xB', '..', '+B5')));
});

describe('modifiers', () => {
	describe('increment', () => {
		it('valid', () => ok(lines('B3', '+B5')));
		it('rejects die not in gigs', () => err('+B5', 1, 'Increment: B is not in any gigs'));
		it('rejects equal', () => err(lines('B3', '+B3'), 2, 'Increment: 3 must be greater than 3'));
		it('rejects lower', () => err(lines('B4', '+B2'), 2, 'Increment: 2 must be greater than 4'));
		it('rejects above max', () => err(lines('B5', '+B7'), 2, 'Increment: 7 exceeds d6 max'));
	});
	describe('decrement', () => {
		it('valid', () => ok(lines('B4', '-B2')));
		it('rejects die not in gigs', () => err('-B2', 1, 'Decrement: B is not in any gigs'));
		it('rejects equal', () => err(lines('B3', '-B3'), 2, 'Decrement: 3 must be less than 3'));
		it('rejects higher', () => err(lines('B3', '-B5'), 2, 'Decrement: 5 must be less than 3'));
		it('rejects 0', () => err(lines('B2', '-B0'), 2, 'Decrement: 0 below minimum (1)'));
	});
	describe('set and reroll', () => {
		it('valid set', () => ok(lines('C7', '=C4')));
		it('valid reroll', () => ok(lines('C7', '~C3')));
		it('set may equal current', () => ok(lines('C7', '=C7')));
		it('rejects set out of range', () =>
			err(lines('C7', '=C9'), 2, 'Set: value 9 out of range (1–8)'));
		it('rejects reroll of 0', () =>
			err(lines('C7', '~C0'), 2, 'Reroll: value 0 out of range (1–8)'));
		it('rejects die not in gigs', () => err('~C3', 1, 'Reroll: C is not in any gigs'));
	});
	it("can modify the opponent's die on your turn", () => ok(lines('B3', '-B1')));
	it('can modify your own die while the opponent controls it', () => ok(lines('B3', 'xB', '+B5')));
	it('modification persists for later validation', () => ok(lines('B6', '=B1', '+B3')));
});

describe('reactions', () => {
	it('are performed by the non-active player', () => {
		const report = analyzeDocument("A4 (-A'2)");
		// THEY has not rolled A', so THEY acting on it must fail; the actor flip is what we test.
		expect(report.errors).toEqual([
			expect.objectContaining({ turn: 1, reason: "Decrement: A' is not in any gigs" })
		]);
	});
	it('can modify a die mid-turn', () => {
		const report = analyzeDocument(lines('B4 (-B2) +B5'));
		expect(report.errors).toEqual([]);
		expect(gigs(report, 'w')).toEqual(['B5']);
	});
	it('cannot roll', () => err("A4 (A'3)", 1, 'Roll: reactions cannot roll or steal'));
	it('cannot steal', () =>
		err(lines('A4', "A'2 (xA')"), 2, 'Steal: reactions cannot roll or steal'));
});

describe('swap (CR §6.7)', () => {
	const swapped = lines('A4', "A'2", "B1 A<>A'");

	it('exchanges one die from each side and keeps both values', () => {
		const report = analyzeDocument(swapped);
		expect(report.errors).toEqual([]);
		expect(gigs(report, 'w')).toEqual(['B1', "A'2"]);
		expect(gigs(report, 't')).toEqual(['A4']);
	});
	it('may be written either way round', () => {
		const report = analyzeDocument(lines('A4', "A'2", "B1 A'<>A"));
		expect(report.errors).toEqual([]);
		expect(gigs(report, 'w')).toEqual(['B1', "A'2"]);
	});
	it('accepts <-> and ↔ for <>', () => {
		ok(lines('A4', "A'2", "B1 A<->A'"));
		ok(lines('A4', "A'2", "B1 A↔A'"));
	});
	it('is not a Steal, and changes nobody’s count', () => {
		const report = analyzeStrict(lines(...SIX_EACH, '..', '..', "A<>A'"));
		expect(report.errors).toEqual([]);
		expect(report.outcome).toEqual({ kind: 'undecided' });
		expect(report.state.w.gigs).toHaveLength(6);
		expect(report.state.t.gigs).toHaveLength(6);
	});
	it('rejects two dice from the same side', () =>
		err(
			lines('A4', "A'2", 'B1 A<>B'),
			3,
			"Swap: needs one die from each side's gigs, but A and B are both in WE's"
		));
	it('rejects a die that is not in any Gigs', () =>
		err(lines('A4', "A'2", "B1 C<>A'"), 3, 'Swap: C is not in any gigs'));
	it('rejects the same die twice', () =>
		err(lines('A4', "A'2", 'B1 A<>A'), 3, 'Swap: needs two different dice'));
	it('cannot be a reaction', () =>
		err(lines('A4', "A'2", "B1 (A<>A')"), 3, 'Swap: reactions cannot swap'));
	it.each(['A<>', '<>A', "A<>B'3", 'a<>b', 'A<>>B'])('rejects the malformed %s', (raw) =>
		err(lines('A4', "A'2", `B1 ${raw}`), 3, 'invalid move syntax')
	);
});

describe('actor by turn parity', () => {
	it('odd turns are the first player', () => {
		const report = analyzeDocument(lines('A4', "A'2", 'B4'));
		expect(report.turns.map((t) => t.actor)).toEqual(['w', 't', 'w']);
	});
	it('flips with first: THEY', () => {
		const report = analyzeDocument(lines('first: THEY', "A'4", 'A2'));
		expect(report.turns.map((t) => t.actor)).toEqual(['t', 'w']);
		expect(report.errors).toEqual([]);
	});
	it("rejects WE rolling on THEY's turn", () =>
		err(lines('A4', 'B3'), 2, "Roll: B is not THEY's die"));
});

describe('win', () => {
	// WE rolls five (turns 1–9), THEY rolls A' and B' (turns 2, 4), everyone passes to `stealTurn`.
	const game = (stealTurn: number, ...after: string[]) => {
		const turns = [...WE_ROLLS_FIVE];
		turns[1] = "A'1";
		turns[3] = "B'1";
		while (turns.length < stealTurn - 1) turns.push('..');
		turns.push("xA' xB'", ...after);
		return lines(...turns);
	};

	it('is declared at the start of the winning player’s next turn', () => {
		const report = analyzeDocument(game(11, '..'));
		expect(report.errors).toEqual([]);
		expect(report.outcome).toEqual({ kind: 'win', player: 'w', turn: 13, how: 'start' });
	});
	it('is not inferred across an unrecorded opponent turn', () => {
		expect(analyzeDocument(game(11)).outcome).toEqual({ kind: 'undecided' });
	});
	it('is not declared before the seventh die', () => {
		expect(analyzeDocument(lines(...WE_ROLLS_FIVE)).outcome).toEqual({ kind: 'undecided' });
	});
	it('flags moves written after the game ended', () => {
		const report = analyzeDocument(game(11, '..', 'F20'));
		expect(report.outcome).toEqual({ kind: 'win', player: 'w', turn: 13, how: 'start' });
		expect(report.errors).toEqual([
			expect.objectContaining({ turn: 13, raw: 'F20', reason: 'move after game end' })
		]);
	});
	it('flags a pass written after the game ended', () =>
		err(game(11, '..', '..'), 13, 'turn after game end'));
	it('is immediate on a steal during overtime', () => {
		const report = analyzeDocument(game(15));
		expect(report.outcome).toEqual({ kind: 'win', player: 'w', turn: 15, how: 'overtime' });
	});
	it('overtime win ends the turn immediately', () =>
		err(game(15) + ' -A1', 15, 'move after game end'));
	it('does not apply overtime before turn 15', () => {
		expect(analyzeDocument(game(13, '..')).outcome).toEqual({
			kind: 'win',
			player: 'w',
			turn: 15,
			how: 'start'
		});
	});
});

describe('soft cap', () => {
	it('warns past 16 turns', () => {
		const report = analyzeDocument(lines(...Array<string>(17).fill('..')));
		expect(report.warnings).toEqual(['game ran 17 turns; 16 is the soft cap']);
		expect(report.errors).toEqual([]);
	});
	it('does not warn at 16', () => {
		expect(analyzeDocument(lines(...Array<string>(16).fill('..'))).warnings).toEqual([]);
	});
});

describe('examples', () => {
	it('valid game has no errors and WE wins at the start of turn 11', () => {
		const report = analyzeStrict(VALID_GAME);
		expect(report.errors).toEqual([]);
		expect(report.turns).toHaveLength(10);
		expect(report.outcome).toEqual({ kind: 'win', player: 'w', turn: 11, how: 'start' });
		expect(gigs(report, 'w')).toEqual(['A1', 'B1', 'D4', "B'1", "A'4", 'E7', "C'3", "D'4"]);
		expect(gigs(report, 't')).toEqual(['C8', "E'12"]);
		expect(fixer(report, 'w')).toEqual(['F']);
		expect(fixer(report, 't')).toEqual(["F'"]);
	});
	it('invalid game reports every planted error by turn', () => {
		const report = analyzeStrict(INVALID_GAME);
		expect(report.outcome).toEqual({ kind: 'undecided' });
		expect(report.errors.map((e) => [e.turn, e.raw])).toEqual([
			[3, "B'3"],
			[5, 'C9'],
			[6, 'xC'],
			[7, "xD'"],
			[8, 'A5'],
			[9, "xC'2"],
			[10, ''],
			[11, '12']
		]);
	});
});

/** Both players roll all six dice, one a turn: twelve turns, THEY's with a prime. */
const SIX_EACH = ['A', 'B', 'C', 'D', 'E', 'F'].flatMap((l) => [`${l}1`, `${l}'1`]);

describe('one roll a turn (CR §8.6.5)', () => {
	const strict = (doc: string) => analyzeStrict(doc).errors;
	const reasons = (doc: string) => strict(doc).map((e) => [e.turn, e.reason]);

	it('accepts a turn that begins with its one Roll', () => {
		expect(strict(lines('A4 -A1', "A'4"))).toEqual([]);
	});
	it('rejects a turn with no Roll while the Fixer has dice', () => {
		expect(reasons(lines('A4', 'xA'))).toEqual([
			[2, 'no Roll — a Turn begins with a Roll while the Fixer has dice']
		]);
	});
	it('rejects a pass while the Fixer has dice', () => {
		expect(reasons('..')).toEqual([
			[1, 'no Roll — a Turn begins with a Roll while the Fixer has dice']
		]);
	});
	it('allows a pass once the Fixer is empty', () => {
		expect(strict(lines(...SIX_EACH, '..', '..'))).toEqual([]);
	});
	it('allows a turn of steals and changes, with no Roll, once the Fixer is empty', () => {
		expect(strict(lines(...SIX_EACH, "xA' =A'1", '..'))).toEqual([]);
	});
	it('rejects a second Roll in the same Turn, and leaves that die in the Fixer', () => {
		expect(reasons('A4 B3')).toEqual([[1, 'Roll: only one die is rolled in per Turn']]);
		expect(fixer(analyzeStrict('A4 B3'), 'w')).toContain('B');
	});
	it('rejects a Roll that is not the first move', () => {
		expect(reasons(lines('A4', "A'4", '-A1 B3'))).toEqual([
			[3, 'the Roll comes first — a Turn begins by rolling a die in']
		]);
	});
	it('does not also call a refused Roll a missing one', () => {
		expect(reasons('A5')).toEqual([[1, 'Roll: value 5 out of range (1–4)']]);
	});
	it('does not also call a blank line a missing Roll', () => {
		expect(reasons(lines('A4', '', 'B4'))).toEqual([[2, 'empty turn — write .. to pass']]);
	});
	it('does not ask for a Roll after the game has ended', () => {
		// WE wins at the start of turn 11 with a Fixer that still holds the d20.
		expect(analyzeStrict(`${VALID_GAME}\n..`).errors.map((e) => e.reason)).toEqual([
			'turn after game end'
		]);
	});
});

describe('overtime (CR §1.11)', () => {
	it('always begins with turn 15: one die a turn, six each, leaves both Fixers empty by turn 12', () => {
		const report = analyzeStrict(lines(...SIX_EACH));
		expect(report.state.w.fixer).toEqual([]);
		expect(report.state.t.fixer).toEqual([]);
	});
	it('a steal to seven on turn 15 wins at once', () => {
		const report = analyzeStrict(lines(...SIX_EACH, '..', '..', "xA'"));
		expect(report.errors).toEqual([]);
		expect(report.outcome).toEqual({ kind: 'win', player: 'w', turn: 15, how: 'overtime' });
	});
	it('a steal to seven on turn 14 wins as overtime begins, and nothing may follow', () => {
		const doc = lines(...SIX_EACH, '..', 'xA', 'B1');
		const report = analyzeStrict(doc);
		expect(report.outcome).toEqual({ kind: 'win', player: 't', turn: 14, how: 'overtime-start' });
		expect(report.errors).toEqual([
			expect.objectContaining({ turn: 15, reason: 'move after game end' })
		]);
	});
	it('a steal to seven on turn 13 is only a win once the winner’s next turn starts', () => {
		const report = analyzeStrict(lines(...SIX_EACH, "xA'", '..'));
		expect(report.outcome).toEqual({ kind: 'win', player: 'w', turn: 15, how: 'start' });
	});
});
