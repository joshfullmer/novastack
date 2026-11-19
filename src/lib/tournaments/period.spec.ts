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

const NOW = Date.parse('2026-12-01T00:00:00Z');
const at = (asked: string | null, narrowing = ANY_EVENTS) =>
	resolvePeriod(metas, asked, narrowing, NOW);

describe('periods', () => {
	it('lists the metas newest first, then all time', () => {
		expect(periodChoices(metas, NOW).map((p) => p.name)).toEqual([
			'Edgerunners',
			'Launch',
			'All time'
		]);
	});

	it('is just all time when nothing has been seeded', () => {
		expect(periodChoices([], NOW)).toEqual([ALL_TIME]);
		expect(resolvePeriod([], null, ANY_EVENTS, NOW)).toEqual(ALL_TIME);
	});

	it('resolves a meta id to its window, open-ended when it has no end', () => {
		expect(at('1')).toEqual({
			id: 1,
			name: 'Launch',
			from: Date.parse('2026-09-01T00:00:00Z'),
			to: Date.parse('2026-11-01T00:00:00Z'),
			param: '1',
			...ANY_EVENTS
		});
		expect(at('2').to).toBeNull();
	});

	it('resolves "all" to all time', () => {
		expect(at('all')).toMatchObject({ id: null, from: null, to: null, name: 'All time' });
	});
});

describe('the default period', () => {
	it('is the newest meta that has started, for a request that names none', () => {
		expect(at(null)).toMatchObject({ id: 2, name: 'Edgerunners' });
	});

	it('skips a meta that has not started yet', () => {
		const before = resolvePeriod(metas, null, ANY_EVENTS, Date.parse('2026-10-01T00:00:00Z'));
		expect(before).toMatchObject({ id: 1, name: 'Launch' });
		expect(resolvePeriod(metas, null, ANY_EVENTS, Date.parse('2026-01-01T00:00:00Z'))).toEqual(
			ALL_TIME
		);
	});

	it.each([[''], ['abc'], ['-1'], ['1.5'], ['99'], ['1; DROP TABLE'], ['9999999999999']])(
		'is what an unrecognised %j gets, not an error',
		(asked) => {
			expect(at(asked)).toEqual(at(null));
		}
	);

	it('is left out of links, while everything else says what it is', () => {
		const named = (asked: string | null) => periodParams(at(asked)).period;
		expect(named(null)).toBeNull();
		expect(named('2')).toBeNull();
		expect(named('1')).toBe('1');
		expect(named('all')).toBe('all');
	});

	it('gives the selector the same params, so every link round-trips', () => {
		for (const choice of periodChoices(metas, NOW)) {
			const back = at(choice.param);
			expect([back.id, back.param]).toEqual([choice.id, choice.param]);
		}
	});

	it('adds no param for all time while there is no meta to default to', () => {
		expect(periodParams(resolvePeriod([], 'all', ANY_EVENTS, NOW)).period).toBeNull();
	});
});

describe('narrowing', () => {
	const parse = (query: string) => parseNarrowing(new URLSearchParams(query));

	it('reads a kind and a field-size floor', () => {
		expect(parse('kind=Regional&min=32')).toEqual({ kinds: ['Regional'], minPlayers: 32 });
	});

	it('reads several kinds, comma-separated or repeated, once each in the usual order', () => {
		const both = { kinds: ['Regional', 'Showdown'], minPlayers: null };
		expect(parse('kind=Showdown,Regional')).toEqual(both);
		expect(parse('kind=Showdown&kind=Regional&kind=Showdown')).toEqual(both);
		expect(parse('kind=Showdown,nonsense,')).toEqual({ kinds: ['Showdown'], minPlayers: null });
	});

	it.each([['kind=regional'], ['kind=&min='], ['min=10'], ['min=-8'], ['min=8.5'], ['min=abc']])(
		'treats %j as "any events", not an error',
		(query) => {
			expect(parse(query)).toEqual(ANY_EVENTS);
		}
	);

	it('rides along with whichever window was asked for', () => {
		const period = at('2', { kinds: ['Showdown'], minPlayers: 16 });
		expect(period).toMatchObject({
			id: 2,
			name: 'Edgerunners',
			kinds: ['Showdown'],
			minPlayers: 16
		});
		expect(at('all', { kinds: ['Showdown'], minPlayers: null })).toMatchObject({
			id: null,
			kinds: ['Showdown']
		});
	});

	it('is carried by every link through periodParams, and only what is set is a param', () => {
		expect(periodParams(at('1', { kinds: ['Brawl', 'Showdown'], minPlayers: 8 }))).toEqual({
			period: '1',
			kind: 'Showdown,Brawl',
			min: 8
		});
		expect(periodParams(ALL_TIME)).toEqual({ period: null, kind: null, min: null });
	});
});
