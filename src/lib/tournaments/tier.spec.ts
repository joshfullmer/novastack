/**
 * Tiers rank how a deck has performed: the lower confidence bound on its match win rate (what it has
 * proven), banded into S to D. A group needs `MIN_DECKS` decks and `MIN_MATCHES` matches to be ranked.
 */
import { describe, expect, it } from 'vitest';
import { MIN_DECKS, MIN_MATCHES, power, TIER_FLOORS, tierOf } from './meta.ts';

describe('power', () => {
	it('approaches the win rate over a very long record', () => {
		expect(power(0.6, 1_000_000)).toBeCloseTo(0.6, 2);
	});

	it('sits below the win rate, and further below on a shorter record', () => {
		const short = power(0.6, 50) ?? 0;
		const long = power(0.6, 1000) ?? 0;
		expect(short).toBeLessThan(long);
		expect(long).toBeLessThan(0.6);
	});

	it('proves less from a perfect short record than from a perfect long one', () => {
		expect(power(1, 5) ?? 1).toBeLessThan(power(1, 100) ?? 0);
	});

	it('is null when nothing was played', () => {
		expect(power(null, 0)).toBeNull();
		expect(power(0.5, 0)).toBeNull();
	});
});

describe('tierOf', () => {
	/** The win rate whose power over `matches` is `target`, found by bisection (power rises with win rate). */
	const at = (target: number, matches = 400) => {
		let [lo, hi] = [0, 1];
		for (let i = 0; i < 60; i++) {
			const mid = (lo + hi) / 2;
			if ((power(mid, matches) ?? 0) < target) lo = mid;
			else hi = mid;
		}
		return tierOf(MIN_DECKS, hi, matches);
	};

	it('bands power into S, A, B, C and D', () => {
		expect(at(0.7)).toBe('S');
		expect(at(TIER_FLOORS.S + 0.001)).toBe('S');
		expect(at(TIER_FLOORS.S - 0.001)).toBe('A');
		expect(at(TIER_FLOORS.A + 0.001)).toBe('A');
		expect(at(TIER_FLOORS.A - 0.001)).toBe('B');
		expect(at(TIER_FLOORS.B + 0.001)).toBe('B');
		expect(at(TIER_FLOORS.B - 0.001)).toBe('C');
		expect(at(TIER_FLOORS.C + 0.001)).toBe('C');
		expect(at(TIER_FLOORS.C - 0.001)).toBe('D');
		expect(at(0.2)).toBe('D');
	});

	it('does not rank a group of fewer than MIN_DECKS decks, however well it did', () => {
		expect(tierOf(MIN_DECKS - 1, 1, 500)).toBeNull();
		expect(tierOf(MIN_DECKS, 1, 500)).toBe('S');
	});

	it('does not rank a group of fewer than MIN_MATCHES matches, however well it did', () => {
		expect(tierOf(MIN_DECKS, 0.61, MIN_MATCHES - 1)).toBeNull();
		expect(tierOf(MIN_DECKS, 0.61, MIN_MATCHES)).not.toBeNull();
	});

	it('does not rank a group that played no matches', () => {
		expect(tierOf(MIN_DECKS, null, 0)).toBeNull();
	});

	it('lets a long strong record out-rank a short one with the same win rate', () => {
		// 61% over 100 matches proves less than 61% over 1000.
		expect(tierOf(MIN_DECKS, 0.58, 100)).toBe('A');
		expect(tierOf(MIN_DECKS, 0.58, 1000)).toBe('S');
	});
});
