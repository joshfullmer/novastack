import { describe, expect, it } from 'vitest';
import { weekStart, buildTrend, isOver, MIN_FIELD, MIN_MATCHES, type DayRow } from './trend.ts';

const day = (day: string, key: string, decks: number, wins = 0, losses = 0, draws = 0): DayRow => ({
	day,
	key,
	decks,
	wins,
	losses,
	draws
});
const NOW = Date.parse('2026-12-20T00:00:00Z');

describe('weekStart', () => {
	it('puts a week on its Monday, whatever day of it an event fell on', () => {
		// 2026-11-15 is a Sunday: its week began Monday the 9th.
		for (const d of ['2026-11-09', '2026-11-13', '2026-11-15'])
			expect(new Date(weekStart(d)).toISOString()).toBe('2026-11-09T00:00:00.000Z');
		expect(new Date(weekStart('2026-11-16')).toISOString()).toBe('2026-11-16T00:00:00.000Z');
	});
});

describe('isOver', () => {
	it('is true only once the whole bucket has passed', () => {
		const monday = weekStart('2026-11-16');
		expect(isOver(monday, monday + 6 * 86_400_000)).toBe(false);
		expect(isOver(monday, monday + 7 * 86_400_000)).toBe(true);
	});
});

describe('buildTrend', () => {
	const rows = [
		// Week of Nov 9: X 30 decks of 40.
		day('2026-11-13', 'X', 20, 40, 20),
		day('2026-11-14', 'X', 10, 18, 12),
		day('2026-11-14', 'Y', 10, 10, 20),
		// Week of Nov 16: X 10 of 40.
		day('2026-11-21', 'X', 10, 5, 5),
		day('2026-11-21', 'Y', 30, 40, 40)
	];

	it('works out each group’s share of the whole field in each week', () => {
		const trend = buildTrend(rows, NOW);
		const [x, y] = trend.series;
		expect(x.key).toBe('X');
		expect(x.points.map((p) => p.share)).toEqual([30 / 40, 10 / 40]);
		expect(y.points.map((p) => p.share)).toEqual([10 / 40, 30 / 40]);
	});

	it('quotes a win rate only where there are enough matches, a draw counting half', () => {
		const [x, y] = buildTrend(rows, NOW).series;
		// X, week 1: 58 wins, 32 losses of 90 matches. Week 2: 10 matches, too few.
		expect(x.points[0].winRate).toBe(58 / 90);
		expect(x.points[1].winRate).toBeNull();
		expect(y.points[1].matches).toBe(80);
		expect(y.points[1].winRate).toBe(0.5);
		expect(MIN_MATCHES).toBe(30);
	});

	it('keeps a week that has not finished, and says so', () => {
		const monday = weekStart('2026-11-16');
		const trend = buildTrend(rows, monday + 5 * 86_400_000);
		expect(trend.times).toEqual([weekStart('2026-11-09'), monday]);
		expect(trend.series[0].points.map((p) => p.partial)).toEqual([false, true]);
		expect(buildTrend(rows, NOW).series[0].points.map((p) => p.partial)).toEqual([false, false]);
	});

	it('leaves out a bucket with too small a field to read', () => {
		const thin = [day('2026-11-13', 'X', MIN_FIELD - 1), day('2026-11-21', 'X', MIN_FIELD)];
		expect(buildTrend(thin, NOW).times).toEqual([weekStart('2026-11-21')]);
	});

	it('draws the most-played groups, most first, and no more than asked', () => {
		const many = ['A', 'B', 'C'].map((key, i) => day('2026-11-13', key, 30 - i * 5));
		expect(buildTrend(many, NOW, 2).series.map((s) => s.key)).toEqual(['A', 'B']);
	});
});
