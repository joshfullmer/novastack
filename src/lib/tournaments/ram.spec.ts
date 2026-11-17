import { describe, expect, it } from 'vitest';
import { parseRam, ramLabel, ramOf, ramParts, ramShorthand } from './ram.ts';

const legend = (color: 'Red' | 'Yellow' | 'Green' | 'Blue', ramProvided: number | null = 2) => ({
	color,
	ramProvided
});

describe('ramOf', () => {
	it('adds what each Legend provides, per colour, in the canonical spelling', () => {
		// Yellow 4, Red 2: `r` sorts before `y` in the canonical order.
		expect(ramOf([legend('Yellow'), legend('Yellow'), legend('Red')])).toBe('rryyyy');
	});

	it('tells GGR from RRG, which share the same colours', () => {
		const ggr = ramOf([legend('Green'), legend('Green'), legend('Red')]);
		const rrg = ramOf([legend('Red'), legend('Red'), legend('Green')]);
		expect(ggr).toBe('ggggrr');
		expect(rrg).toBe('ggrrrr');
		expect(ggr).not.toBe(rrg);
	});

	it('does not assume a Legend provides 2', () => {
		expect(ramOf([legend('Blue', 3), legend('Blue', 1), legend('Red', 2)])).toBe('bbbbrr');
	});

	it('is the same whatever order the Legends come in', () => {
		expect(ramOf([legend('Red'), legend('Yellow'), legend('Yellow')])).toBe('rryyyy');
	});

	it('is null when it cannot be known', () => {
		expect(ramOf([legend('Red'), legend('Red')])).toBeNull();
		expect(ramOf([legend('Red'), legend('Red'), legend('Blue', null)])).toBeNull();
		expect(ramOf([legend('Red', 0), legend('Red', 0), legend('Red', 0)])).toBeNull();
	});
});

describe('parseRam', () => {
	it('canonicalises any spelling the query language accepts', () => {
		expect(parseRam('yyyyrr', 2)).toBe('rryyyy');
		expect(parseRam('r2y4', 2)).toBe('rryyyy');
	});

	it('reads uppercase as a Legend each: YYR is yyyyrr', () => {
		expect(parseRam('YYR', 2)).toBe('rryyyy');
		expect(parseRam('RYY', 2)).toBe('rryyyy');
		expect(parseRam('GGR', 2)).not.toBe(parseRam('RRG', 2));
		expect(parseRam('RYG', 2)).toBe('ggrryy');
		expect(parseRam('BBB', 2)).toBe('bbbbbb');
	});

	it('reads lowercase as RAM, exactly, whatever a Legend provides', () => {
		expect(parseRam('yyr', 2)).toBe('ryy'); // Yellow 2, Red 1: not a deck, but what it says
		expect(parseRam('y2r1', 2)).toBe('ryy');
		expect(parseRam('yyyyrr', 3)).toBe('rryyyy');
		expect(parseRam('YYR', 3)).toBe('rrryyyyyy');
	});

	it('rejects what is not a RAM', () => {
		expect(parseRam(null, 2)).toBeNull();
		expect(parseRam('', 2)).toBeNull();
		expect(parseRam('yyxr', 2)).toBeNull();
		expect(parseRam('r0', 2)).toBeNull();
		expect(parseRam('y'.repeat(41), 2)).toBeNull();
	});
});

describe('how a RAM is said', () => {
	it('puts the dominant colour first', () => {
		expect(ramLabel('rryyyy')).toBe('yyyyrr');
		expect(ramLabel('ggrrrr')).toBe('rrrrgg');
	});

	it('breaks a tie in the order Red, Yellow, Green, Blue', () => {
		expect(ramLabel('bbgg')).toBe('ggbb');
		expect(ramLabel('bbggrryy')).toBe('rryyggbb');
	});

	it('lists the parts with their amounts', () => {
		expect(ramParts('rryyyy')).toEqual([
			{ colour: 'Yellow', amount: 4 },
			{ colour: 'Red', amount: 2 }
		]);
	});
});

describe('the shorthand for a RAM', () => {
	it('says YYR for yyyyrr, dominant colour first', () => {
		expect(ramShorthand('rryyyy', 2)).toBe('YYR');
		expect(ramShorthand('ggrrrr', 2)).toBe('RRG');
		expect(ramShorthand('bbggrryy', 2)).toBeNull(); // four Legends' worth
	});

	it('round-trips with parseRam', () => {
		for (const ram of ['rryyyy', 'ggggrr', 'bbbbbb', 'bbggrr']) {
			const short = ramShorthand(ram, 2);
			expect(short).not.toBeNull();
			expect(parseRam(short, 2)).toBe(ram);
		}
	});

	it('has none when the Legends do not provide alike', () => {
		expect(ramShorthand('rryyyy', 3)).toBeNull();
		expect(ramShorthand('bbbbrr', 1)).toBeNull();
		expect(ramShorthand('bbbbbrr', 2)).toBeNull(); // an odd amount of one colour
	});
});
