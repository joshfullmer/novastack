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
			discover: false,
			search: '',
			names: [],
			pages: Infinity,
			deep: false,
			minPlayers: 8,
			since: null,
			ingest: false,
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

	it('reads every page with --deep', () => {
		expect(parseCli(['--discover', '--deep'])).toMatchObject({ deep: true, pages: Infinity });
	});

	it('takes any number of --name words, to match event names', () => {
		expect(
			parseCli(['--discover', '--name', ' Showdown ', '--name', 'Show Down', '--name', 'Brawl'])
		).toMatchObject({ names: ['Showdown', 'Show Down', 'Brawl'] });
		expect(() => parseCli(['5', '--name', 'x'])).toThrow(/only go with --discover/);
	});

	it('discovers on its own, with a search, a page count and a player floor', () => {
		expect(parseCli(['--discover'])).toMatchObject({
			discover: true,
			ids: [],
			search: '',
			pages: Infinity,
			minPlayers: 8
		});
		expect(
			parseCli(['--discover', '--search', ' showdown ', '--pages', '3', '--min-players', '8'])
		).toMatchObject({ discover: true, search: 'showdown', pages: 3, minPlayers: 8 });
		expect(parseCli(['--discover', '--max-requests', '30'])).toMatchObject({ maxRequests: 30 });
	});

	it('ingests what it finds, with the flags of a normal run but not --force', () => {
		expect(parseCli(['--discover', '--ingest', '--since', '2026-11-01'])).toMatchObject({
			discover: true,
			ingest: true,
			since: '2026-11-01'
		});
		expect(parseCli(['--discover', '--ingest', '--remote', '--yes', '--check'])).toMatchObject({
			remote: true,
			yes: true,
			check: true
		});
		expect(() => parseCli(['--discover', '--ingest', '--force'])).toThrow(/no --force/);
		expect(() => parseCli(['--discover', '--ingest', '5'])).toThrow(/no ids/);
		expect(() => parseCli(['--ingest'])).toThrow(/only go with --discover/);
		expect(() => parseCli(['--discover', '--since', 'last week'])).toThrow(/--since wants/);
	});

	it('refuses --discover with anything that writes, and its flags without it', () => {
		expect(() => parseCli(['--discover', '5'])).toThrow(/takes no ids/);
		expect(() => parseCli(['--discover', '--remote'])).toThrow(/takes no ids/);
		expect(() => parseCli(['--discover', '--check'])).toThrow(/takes no ids/);
		expect(() => parseCli(['--discover', '--pending'])).toThrow(/each their own run/);
		expect(() => parseCli(['5', '--search', 'x'])).toThrow(/only go with --discover/);
		expect(() => parseCli(['--discover', '--pages', '0'])).toThrow(/--pages wants/);
		expect(() => parseCli(['--discover', '--deep', '--pages', '5'])).toThrow(/takes no --pages/);
		expect(() => parseCli(['5', '--deep'])).toThrow(/only go with --discover/);
		expect(() => parseCli(['--discover', '--min-players', 'many'])).toThrow(/--min-players wants/);
	});
});
