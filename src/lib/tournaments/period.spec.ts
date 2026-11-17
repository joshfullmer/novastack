import { describe, expect, it } from 'vitest';
import {
	ALL_TIME,
	ANY_EVENTS,
	parseNarrowing,
	periodChoices,
	periodParams,
	resolvePeriod,
	type MetaRow
} from './period.ts';

const metas: MetaRow[] = [
	{
		id: 1,
		name: 'Launch',
		startsOn: new Date('2026-09-01T00:00:00Z'),
		endsOn: new Date('2026-11-01T00:00:00Z')
	},
	{ id: 2, name: 'Edgerunners', startsOn: new Date('2026-11-01T00:00:00Z'), endsOn: null }
];

describe('periods', () => {
	it('lists all time first, then metas newest first', () => {
		expect(periodChoices(metas).map((p) => p.name)).toEqual(['All time', 'Edgerunners', 'Launch']);
	});

	it('is just all time when nothing has been seeded', () => {
		expect(periodChoices([])).toEqual([ALL_TIME]);
	});

	it('resolves a meta id to its window, open-ended when it has no end', () => {
		expect(resolvePeriod(metas, '2')).toEqual({
			id: 2,
			name: 'Edgerunners',
			from: Date.parse('2026-11-01T00:00:00Z'),
			to: null,
			...ANY_EVENTS
		});
		expect(resolvePeriod(metas, '1').to).toBe(Date.parse('2026-11-01T00:00:00Z'));
	});

	it.each([[null], [''], ['abc'], ['-1'], ['1.5'], ['99'], ['1; DROP TABLE'], ['9999999999999']])(
		'treats %j as all time rather than an error',
		(asked) => {
			expect(resolvePeriod(metas, asked)).toEqual(ALL_TIME);
		}
	);
});

describe('narrowing', () => {
	const parse = (query: string) => parseNarrowing(new URLSearchParams(query));

	it('reads a kind and a field-size floor', () => {
		expect(parse('kind=Regional&min=32')).toEqual({ kind: 'Regional', minPlayers: 32 });
	});

	it.each([['kind=regional'], ['kind=&min='], ['min=10'], ['min=-8'], ['min=8.5'], ['min=abc']])(
		'treats %j as "any events", not an error',
		(query) => {
			expect(parse(query)).toEqual(ANY_EVENTS);
		}
	);

	it('rides along with whichever window was asked for', () => {
		const period = resolvePeriod(metas, '2', { kind: 'Showdown', minPlayers: 16 });
		expect(period).toMatchObject({ id: 2, name: 'Edgerunners', kind: 'Showdown', minPlayers: 16 });
		expect(resolvePeriod(metas, 'nope', { kind: 'Showdown', minPlayers: null })).toMatchObject({
			id: null,
			kind: 'Showdown'
		});
	});

	it('is carried by every link through periodParams, and only what is set is a param', () => {
		expect(periodParams(resolvePeriod(metas, '2', { kind: 'Brawl', minPlayers: 8 }))).toEqual({
			period: 2,
			kind: 'Brawl',
			min: 8
		});
		expect(periodParams(ALL_TIME)).toEqual({ period: null, kind: null, min: null });
	});
});
