import { describe, expect, it } from 'vitest';
import { parseSkipped, serializeSkipped, skip, skippedIds, unskip } from './skipped.ts';

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const sealed = { name: 'Beta Prerelease', format: 'Sealed' };

describe('the list of events skipped for what they are', () => {
	it('remembers an event and keeps when it was first skipped', () => {
		const once = skip({}, 7, sealed, day(1));
		const twice = skip(once, 7, { name: null, format: 'Sealed' }, day(5));
		expect(twice['7']).toEqual({
			name: 'Beta Prerelease',
			format: 'Sealed',
			skippedAt: day(1).toISOString()
		});
	});

	it('forgets only the ids given', () => {
		const list = skip(skip({}, 1, sealed, day(1)), 2, sealed, day(1));
		expect(skippedIds(unskip(list, [1]))).toEqual([2]);
	});

	it('round-trips through its file, in id order', () => {
		const list = skip(skip({}, 20, sealed, day(1)), 3, sealed, day(1));
		const text = serializeSkipped(list);
		expect(Object.keys(JSON.parse(text))).toEqual(['3', '20']);
		expect(parseSkipped(text)).toEqual(list);
	});

	it('reads an absent or empty file as nothing skipped, and refuses anything malformed', () => {
		expect(parseSkipped(null)).toEqual({});
		expect(parseSkipped('  \n')).toEqual({});
		expect(() => parseSkipped('[]')).toThrow();
		expect(() => parseSkipped('{"x": {}}')).toThrow();
	});
});
