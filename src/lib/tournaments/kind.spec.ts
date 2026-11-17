import { describe, expect, it } from 'vitest';
import { EVENT_KINDS, eventKind } from './kind.ts';

describe('eventKind', () => {
	it.each([
		'The Hungry Dragon, Cyberpunk TCG: Night City Showdown',
		'Night City Showdown - DECKS AND DICE',
		'Night City Showdown Presented by Eternal Universe Games',
		'HoloDex CBPK Welcome To Night City Showdown',
		'Cyberpunk TCG Night City Showdown @ Nexus'
	])('calls the real event name "%s" a Showdown', (name) => {
		expect(eventKind(name)).toBe('Showdown');
	});

	// These names are invented to exercise each rule: none has been seen in real data yet.
	it.each([
		['Cyberpunk TCG West Regional Championship', 'Regional'],
		['Night City Regionals 2027', 'Regional'],
		['Cyberpunk TCG Prerelease', 'Prerelease'],
		['Pre-Release Weekend @ Nexus', 'Prerelease'],
		['Edgerunners pre release event', 'Prerelease'],
		['Friday Night Brawl', 'Brawl'],
		['Monthly Brawls', 'Brawl']
	] as const)('synthetic: "%s" is a %s', (name, kind) => {
		expect(eventKind(name)).toBe(kind);
	});

	it('is case-insensitive', () => {
		expect(eventKind('night city SHOWDOWN')).toBe('Showdown');
		expect(eventKind('REGIONAL CHAMPIONSHIP')).toBe('Regional');
	});

	it('tries the bigger event first when a name says two things', () => {
		expect(eventKind('Night City Showdown Regional Qualifier')).toBe('Regional');
		expect(eventKind('Prerelease Brawl')).toBe('Prerelease');
		expect(eventKind('Brawl Showdown')).toBe('Brawl');
	});

	it('matches whole words, not parts of other words', () => {
		expect(eventKind('Brawlers Club Night')).toBe('Other');
		expect(eventKind('Regionality Studies')).toBe('Other');
		expect(eventKind('Prereleased Cards Swap')).toBe('Other');
	});

	it('is Other for a name no rule matches, rather than a guess', () => {
		expect(eventKind('Friday Night Cyberpunk')).toBe('Other');
		expect(eventKind('')).toBe('Other');
	});

	it('only ever returns a declared kind, and declares them in the owner’s order', () => {
		expect(EVENT_KINDS).toEqual(['Regional', 'Showdown', 'Brawl', 'Prerelease', 'Other']);
		for (const name of ['Showdown', 'Regional', 'Brawl', 'Prerelease', 'x']) {
			expect(EVENT_KINDS).toContain(eventKind(name));
		}
	});
});
