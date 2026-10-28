/**
 * The reference page's anti-drift guarantee: every worked example it shows still does what the
 * page says it does, against the real validator. A documented game that quietly stops being valid,
 * or stops producing the board the page claims, fails the build here.
 */
import { describe, expect, it } from 'vitest';
import { analyzeDocument, formatGig } from './index.ts';
import type { GameReport, Owner } from './index.ts';
import { EXAMPLES, MOVES, RULES, example } from './reference.ts';
import type { Claim } from './reference.ts';

const gigs = (report: GameReport, player: Owner) => report.state[player].gigs.map(formatGig);

function check(transcript: string, claim: Claim) {
	const report = analyzeDocument(transcript);
	expect(report.errors).toHaveLength(claim.errors ?? 0);
	if (claim.errorTurns) expect(report.errors.map((e) => e.turn)).toEqual(claim.errorTurns);
	if (claim.outcome) expect(report.outcome).toEqual(claim.outcome);
	for (const player of ['w', 't'] as const) {
		const listed = claim.gigs?.[player];
		if (listed) expect(gigs(report, player)).toEqual(listed);
		const counted = claim.counts?.[player];
		if (counted !== undefined) expect(gigs(report, player)).toHaveLength(counted);
	}
}

describe('every worked example on the reference page', () => {
	it.each(EXAMPLES)('$id does what the page claims', ({ transcript, claim }) =>
		check(transcript, claim)
	);

	it('has no duplicate ids', () => {
		const ids = EXAMPLES.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('is found by id', () => {
		expect(example('valid-game').claim.outcome?.kind).toBe('win');
		expect(() => example('nope')).toThrow();
	});
});

describe('every move demo on the reference page', () => {
	it.each(MOVES)('$action$demo is legal and lands the claimed board', ({ setup, demo, claim }) =>
		check([...setup, demo].join('\n'), claim)
	);
});

describe('rules awaiting a Comprehensive Rules citation', () => {
	it('has unique ids', () => {
		const ids = RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
	it('never invents a section number: a citation is null or a non-empty string', () => {
		for (const rule of RULES) expect(rule.cr === null || rule.cr.trim().length > 0).toBe(true);
	});
});
