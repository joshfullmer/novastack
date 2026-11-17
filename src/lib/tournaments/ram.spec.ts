import { describe, expect, it } from 'vitest';
import { parseRam, ramLabel, ramOf, ramParts } from './ram.ts';

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
		expect(parseRam('yyyyrr')).toBe('rryyyy');
		expect(parseRam('YYYYRR')).toBe('rryyyy');
		expect(parseRam('r2y4')).toBe('rryyyy');
	});

	it('rejects what is not a RAM', () => {
		expect(parseRam(null)).toBeNull();
		expect(parseRam('')).toBeNull();
		expect(parseRam('yyxr')).toBeNull();
		expect(parseRam('r0')).toBeNull();
		expect(parseRam('y'.repeat(41))).toBeNull();
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
