import { describe, expect, it } from 'vitest';
import { ALL_TIME, periodChoices, resolvePeriod, type MetaRow } from './period.ts';

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
			to: null
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
