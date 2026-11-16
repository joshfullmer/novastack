import { describe, expect, it } from 'vitest';
import { parseCli } from './args.ts';

describe('pnpm melee arguments', () => {
	it('takes ids and defaults to the LOCAL database', () => {
		expect(parseCli(['485070', '485071'])).toEqual({
			ids: [485070, 485071],
			remote: false,
			yes: false,
			check: false,
			reparse: false,
			persistTo: undefined,
			maxRequests: undefined
		});
	});

	it('writes production only when --remote is typed', () => {
		expect(parseCli(['1', '--remote']).remote).toBe(true);
		expect(parseCli(['1']).remote).toBe(false);
	});

	it('reads the flags', () => {
		expect(parseCli(['1', '--check', '--max-requests', '40'])).toMatchObject({
			check: true,
			maxRequests: 40
		});
		expect(parseCli(['--reparse', '--remote'])).toMatchObject({
			reparse: true,
			ids: [],
			remote: true
		});
	});

	it('wants an id, unless re-reading', () => {
		expect(() => parseCli([])).toThrow(/at least one/);
	});

	it.each([['abc'], ['-5'], ['1.5'], ['0'], ['12x']])('refuses "%s" as an id', (text) => {
		expect(() => parseCli([text])).toThrow();
	});

	it('refuses a repeated id, an unknown flag, and flags that make no sense together', () => {
		expect(() => parseCli(['1', '1'])).toThrow(/twice/);
		expect(() => parseCli(['1', '--force'])).toThrow();
		expect(() => parseCli(['--reparse', '1'])).toThrow(/takes no ids/);
		expect(() => parseCli(['--reparse', '--check'])).toThrow();
		expect(() => parseCli(['1', '--remote', '--persist-to', '/tmp/x'])).toThrow(/local scratch/);
		expect(() => parseCli(['1', '--max-requests', '0'])).toThrow(/positive/);
	});
});
