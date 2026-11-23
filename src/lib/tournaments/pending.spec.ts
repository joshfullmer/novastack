import { describe, expect, it } from 'vitest';
import {
	describePending,
	forget,
	idsOf,
	parsePending,
	remember,
	serializePending,
	dueFirst,
	lapsed,
	nextTry
} from './pending.ts';

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const refusal = { name: 'Night City Showdown', reason: '1 is "In Progress", not Ended.' };

describe('the list of events that were not ready', () => {
	it('starts empty, from a missing or blank file', () => {
		expect(parsePending(null)).toEqual({});
		expect(parsePending('  \n')).toEqual({});
	});

	it('remembers an event, then counts a second refusal without losing when it was first tried', () => {
		const first = remember({}, 479169, refusal, day(18));
		expect(first['479169']).toEqual({
			name: 'Night City Showdown',
			reason: refusal.reason,
			firstTried: day(18).toISOString(),
			lastTried: day(18).toISOString(),
			attempts: 1
		});
		const again = remember(first, 479169, { name: null, reason: 'No standings yet.' }, day(20))[
			'479169'
		];
		expect(again).toMatchObject({
			name: 'Night City Showdown',
			reason: 'No standings yet.',
			firstTried: day(18).toISOString(),
			lastTried: day(20).toISOString(),
			attempts: 2
		});
	});

	it('forgets only the ids given, and never mutates what it was handed', () => {
		const list = remember(remember({}, 2, refusal, day(1)), 1, refusal, day(1));
		const after = forget(list, [2, 99]);
		expect(idsOf(after)).toEqual([1]);
		expect(idsOf(list)).toEqual([1, 2]);
	});

	it('round-trips through its file, ids in numeric order, one stable text', () => {
		const list = remember(remember({}, 10, refusal, day(1)), 9, refusal, day(1));
		const text = serializePending(list);
		expect(Object.keys(JSON.parse(text))).toEqual(['9', '10']);
		expect(parsePending(text)).toEqual(list);
		expect(serializePending(parsePending(text))).toBe(text);
	});

	it('refuses a file that is not what it wrote', () => {
		expect(() => parsePending('{"abc": {}}')).toThrow();
		expect(() => parsePending('[]')).toThrow();
	});

	it('describes each one with its reason, tries and age', () => {
		const list = remember(remember({}, 7, refusal, day(15)), 7, refusal, day(16));
		expect(describePending(list, day(18))).toEqual([
			`7  Night City Showdown\n      ${refusal.reason}\n      2 tries, first 3d ago, due now, gives up 2026-11-22`
		]);
		expect(describePending(remember({}, 7, { name: null, reason: 'x' }, day(18)), day(18))[0]).toBe(
			'7  (name unknown)\n      x\n      1 try, first today, next 2026-11-18T06:00Z, gives up 2026-11-25'
		);
	});

	it('is next worth trying 6h after the last try', () => {
		let list = remember({}, 1, refusal, day(1));
		list = remember(list, 1, refusal, day(2));
		expect(nextTry(list['1']).toISOString()).toBe('2026-11-02T06:00:00.000Z');
	});

	it('skips what was tried in the last 6h and offers the rest least recently tried first', () => {
		let list = remember({}, 1, refusal, day(3));
		list = remember(list, 2, refusal, day(1));
		list = remember(list, 3, refusal, day(1));
		list = remember(list, 4, refusal, day(5));
		expect(dueFirst(list, day(5))).toEqual([2, 3, 1]);
		expect(dueFirst(list, new Date(day(5).getTime() + 6 * 3_600_000))).toEqual([2, 3, 1, 4]);
	});

	it('stops retrying what is still not ready 7 days after it was first tried, however recently checked', () => {
		let list = remember({}, 1, refusal, day(1));
		list = remember(list, 1, refusal, day(8));
		list = remember(list, 2, refusal, day(5));
		expect(lapsed(list, day(8))).toEqual([1]);
		expect(lapsed(list, day(7))).toEqual([]);
		expect(dueFirst(list, day(9))).toEqual([2]);
		expect(idsOf(list)).toEqual([1, 2]);
		expect(describePending(list, day(9))[0]).toContain('gave up 2026-11-08');
	});
});
