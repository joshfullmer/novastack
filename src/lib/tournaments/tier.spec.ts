/**
 * Tiers rank how a deck performs: its match win rate pulled toward 50% for small samples, banded into
 * S to D. Fewer than `MIN_DECKS` decks is not enough to rank at all.
 */
import { describe, expect, it } from 'vitest';
import { MIN_DECKS, power, TIER_FLOORS, TIER_PRIOR, tierOf } from './meta.ts';

describe('power', () => {
	it('is the win rate itself over a long record, and 50% over none', () => {
		expect(power(0.6, 10_000)).toBeCloseTo(0.6, 2);
		expect(power(0.6, 0)).toBe(0.5);
	});

	it('pulls a short record toward 50% harder than a long one', () => {
		const short = power(1, 5) ?? 0;
		const long = power(1, 100) ?? 0;
		expect(short).toBeLessThan(long);
		expect(short).toBeCloseTo((5 + 0.5 * TIER_PRIOR) / (5 + TIER_PRIOR));
	});

	it('is null when nothing was played', () => {
		expect(power(null, 0)).toBeNull();
	});
});

describe('tierOf', () => {
	const at = (target: number) => {
		// A win rate whose power is exactly `target` over 90 matches.
		const matches = 90;
		const winRate = (target * (matches + TIER_PRIOR) - 0.5 * TIER_PRIOR) / matches;
		return tierOf(MIN_DECKS, winRate, matches);
	};

	it('bands power into S, A, B, C and D', () => {
		expect(at(0.7)).toBe('S');
		expect(at(TIER_FLOORS.S)).toBe('S');
		expect(at(TIER_FLOORS.S - 0.001)).toBe('A');
		expect(at(TIER_FLOORS.A)).toBe('A');
		expect(at(0.5)).toBe('B');
		expect(at(TIER_FLOORS.B)).toBe('B');
		expect(at(TIER_FLOORS.B - 0.001)).toBe('C');
		expect(at(TIER_FLOORS.C)).toBe('C');
		expect(at(TIER_FLOORS.C - 0.001)).toBe('D');
		expect(at(0.2)).toBe('D');
	});

	it('does not rank a group of fewer than MIN_DECKS decks, however well it did', () => {
		expect(tierOf(MIN_DECKS - 1, 1, 50)).toBeNull();
		expect(tierOf(MIN_DECKS, 1, 50)).toBe('S');
	});

	it('does not rank a group that played no matches', () => {
		expect(tierOf(MIN_DECKS, null, 0)).toBeNull();
	});

	it('lets a long strong record out-rank a short perfect-looking one only by its own merit', () => {
		// 5-0 reads as 100% but is pulled to two thirds; 60 wins in 100 stays near 60%.
		expect(power(1, 5)).toBeCloseTo(2 / 3);
		expect(power(0.6, 100)).toBeCloseTo(65 / 110);
	});
});
