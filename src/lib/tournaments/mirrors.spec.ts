import { describe, expect, it } from 'vitest';
import { buildMirrors, MIN_SPLIT, type MirrorRow } from './mirrors.ts';

const row = (slug: string, winners: number, losers: number, both: number, board = 'main') =>
	({ slug, board, winners, losers, both }) as MirrorRow;

describe('buildMirrors', () => {
	it('counts only the matches where exactly one side ran a Card', () => {
		// Run by both in 20 of 20 matches, and by the winner alone in 6, the loser alone in 2.
		const view = buildMirrors([row('x', 26, 22, 20)], 40);
		expect(view.main.winning[0]).toMatchObject({ slug: 'x', winners: 6, losers: 2, split: 8 });
		expect(view.main.winning[0].edge).toBe(6 / 8);
	});

	it('puts a Card in the list for the side that ran it more, and in no other', () => {
		const view = buildMirrors([row('w', 9, 1, 0), row('l', 1, 9, 0), row('even', 5, 5, 0)], 10);
		expect(view.main.winning.map((c) => c.slug)).toEqual(['w']);
		expect(view.main.losing.map((c) => c.slug)).toEqual(['l']);
	});

	it('leaves a Card that was split too few times out of both lists', () => {
		const few = MIN_SPLIT - 1;
		const view = buildMirrors([row('rare', few, 0, 0)], 50);
		expect(view.main).toEqual({ winning: [], losing: [] });
	});

	it('ranks by the proven edge, so many matches beat a hot streak over a few', () => {
		const view = buildMirrors([row('few', 8, 2, 0), row('many', 700, 300, 0)], 1000);
		// 8 of 10 is an 80% edge on thin evidence; 700 of 1,000 (70%) proves more than that.
		expect(view.main.winning.map((c) => c.slug)).toEqual(['many', 'few']);
	});

	it('keeps the main deck and the sideboard apart', () => {
		const view = buildMirrors([row('c', 8, 0, 0, 'main'), row('c', 0, 8, 0, 'side')], 8);
		expect(view.main.winning.map((c) => c.slug)).toEqual(['c']);
		expect(view.side.losing.map((c) => c.slug)).toEqual(['c']);
		expect(view.main.losing).toEqual([]);
		expect(view.side.winning).toEqual([]);
	});

	it('is empty when nobody mirrored', () => {
		expect(buildMirrors([], 0)).toEqual({
			matches: 0,
			main: { winning: [], losing: [] },
			side: { winning: [], losing: [] }
		});
	});
});
