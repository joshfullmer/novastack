/**
 * The window every statistic is cut by: all time, or one `metas` row (`docs/spec/tournaments.md` §3).
 *
 * A Tournament belongs to a period when its start falls in `[from, to)`: **derived, never assigned**,
 * so moving a meta's dates needs no edit to any event. The choice lives in `?period=<meta id>` so a link
 * carries it, and anything unrecognised means all time rather than an error.
 */
export type MetaRow = { id: number; name: string; startsOn: Date; endsOn: Date | null };

export type Period = {
	/** The `metas` id; null for all time. */
	id: number | null;
	name: string;
	/** Milliseconds, inclusive; null for unbounded. */
	from: number | null;
	/** Milliseconds, exclusive; null for unbounded. */
	to: number | null;
};

export const ALL_TIME: Period = { id: null, name: 'All time', from: null, to: null };

const fromMeta = (meta: MetaRow): Period => ({
	id: meta.id,
	name: meta.name,
	from: meta.startsOn.getTime(),
	to: meta.endsOn ? meta.endsOn.getTime() : null
});

/** All time first, then the metas newest first: the order a selector shows them in. */
export function periodChoices(metas: readonly MetaRow[]): Period[] {
	return [
		ALL_TIME,
		...[...metas].sort((a, b) => b.startsOn.getTime() - a.startsOn.getTime()).map(fromMeta)
	];
}

export function resolvePeriod(metas: readonly MetaRow[], asked: string | null): Period {
	if (asked === null || !/^\d{1,9}$/.test(asked)) return ALL_TIME;
	const meta = metas.find((m) => m.id === Number(asked));
	return meta ? fromMeta(meta) : ALL_TIME;
}
