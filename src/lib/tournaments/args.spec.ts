import { describe, expect, it } from 'vitest';
import { parseCli } from './args.ts';

describe('pnpm melee arguments', () => {
	it('takes ids and defaults to the LOCAL database', () => {
		expect(parseCli(['485070', '485071'])).toEqual({
			ids: [485070, 485071],
			remote: false,
			yes: false,
			check: false,
			force: false,
			reparse: false,
			promote: false,
			pending: false,
			list: false,
			forget: false,
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

	it('skips what is stored unless --force', () => {
		expect(parseCli(['1']).force).toBe(false);
		expect(parseCli(['1', '--force']).force).toBe(true);
	});

	it('promotes local to production, for every event or the ones named, never with --remote', () => {
		expect(parseCli(['--promote'])).toMatchObject({ promote: true, ids: [] });
		expect(parseCli(['--promote', '5', '--check', '--yes'])).toMatchObject({
			promote: true,
			ids: [5],
			check: true,
			yes: true
		});
		for (const flag of [
			'--remote',
			'--force',
			'--reparse',
			'--persist-to=/tmp/x',
			'--max-requests=3'
		]) {
			expect(() => parseCli(['--promote', flag])).toThrow();
		}
	});

	it('retries, lists and forgets what was not ready', () => {
		expect(parseCli(['--pending'])).toMatchObject({ pending: true, ids: [] });
		expect(parseCli(['--pending', '--remote', '--yes'])).toMatchObject({
			pending: true,
			remote: true
		});
		expect(parseCli(['--list'])).toMatchObject({ list: true });
		expect(parseCli(['--forget', '5', '6'])).toMatchObject({ forget: true, ids: [5, 6] });
		expect(() => parseCli(['--pending', '5'])).toThrow(/takes no ids/);
		expect(() => parseCli(['--list', '5'])).toThrow(/takes no ids/);
		expect(() => parseCli(['--forget'])).toThrow(/wants the ids/);
		expect(() => parseCli(['--list', '--remote'])).toThrow(/take no other flags/);
		expect(() => parseCli(['--pending', '--list'])).toThrow(/each their own run/);
		expect(() => parseCli(['--forget', '1', '--promote'])).toThrow(/each their own run/);
	});

	it('wants an id, unless re-reading', () => {
		expect(() => parseCli([])).toThrow(/at least one/);
	});

	it.each([['abc'], ['-5'], ['1.5'], ['0'], ['12x']])('refuses "%s" as an id', (text) => {
		expect(() => parseCli([text])).toThrow();
	});

	it('refuses a repeated id, an unknown flag, and flags that make no sense together', () => {
		expect(() => parseCli(['1', '1'])).toThrow(/twice/);
		expect(() => parseCli(['1', '--frobnicate'])).toThrow();
		expect(() => parseCli(['1', '--force', '--check'])).toThrow(/--force only applies/);
		expect(() => parseCli(['--reparse', '--force'])).toThrow(/--force only applies/);
		expect(() => parseCli(['--reparse', '1'])).toThrow(/takes no ids/);
		expect(() => parseCli(['--reparse', '--check'])).toThrow();
		expect(() => parseCli(['1', '--remote', '--persist-to', '/tmp/x'])).toThrow(/local scratch/);
		expect(() => parseCli(['1', '--max-requests', '0'])).toThrow(/positive/);
	});
});
