/**
 * The scope every statistic is cut by: a window (all time, or one `metas` row; `docs/spec/tournaments.md`
 * §3) and, optionally, which events count (a kind, a minimum field size).
 *
 * A Tournament belongs to a period when its start falls in `[from, to)`: **derived, never assigned**,
 * so moving a meta's dates needs no edit to any event. The choice lives in `?period=<meta id>` so a link
 * carries it, and anything unrecognised means all time rather than an error.
 */
import { formatKinds, parseKinds, type EventKind } from './kind.ts';

/** The field sizes the stats pages offer as a floor ("only events with 16 or more players"). */
export const FIELD_FLOORS = [8, 16, 32, 64] as const;

/** What a statistic is narrowed to beyond its dates: which events count at all. */
export type Narrowing = {
	/** Only events of these kinds; empty for any. */
	kinds: readonly EventKind[];
	/** Only events with at least this many players; null for any. */
	minPlayers: number | null;
};

export const ANY_EVENTS: Narrowing = { kinds: [], minPlayers: null };

/**
 * `?kind=` (one or several, comma-separated) and `?min=`, with anything unrecognised meaning "any"
 * rather than an error.
 */
export function parseNarrowing(params: URLSearchParams): Narrowing {
	const min = Number(params.get('min'));
	return {
		kinds: parseKinds(params.getAll('kind')),
		minPlayers: FIELD_FLOORS.find((floor) => floor === min) ?? null
	};
}

export type MetaRow = { id: number; name: string; startsOn: Date; endsOn: Date | null };

export type Period = Narrowing & {
	/** The `metas` id; null for all time. */
	id: number | null;
	name: string;
	/** Milliseconds, inclusive; null for unbounded. */
	from: number | null;
	/** Milliseconds, exclusive; null for unbounded. */
	to: number | null;
	/**
	 * What `?period=` must say to get this period back: null when saying nothing does (the default, or
	 * all time while there is no meta), `all` for all time otherwise, else the meta's id.
	 */
	param: string | null;
};

export const ALL_TIME: Period = {
	id: null,
	name: 'All time',
	from: null,
	to: null,
	param: null,
	...ANY_EVENTS
};

/** The query that carries a period and its narrowing from one link to the next. */
export const periodParams = (period: Period) => ({
	period: period.param,
	kind: formatKinds(period.kinds),
	min: period.minPlayers
});

/**
 * Every choice a selector offers, and which one a request that names none gets.
 *
 * **The default is the current meta**: the newest one that has started. Across years of a game that
 * changes with each set and ban, all time is a history, not "the meta", so it is one click away
 * (`?period=all`) and not what a bare link shows. With no meta yet, or none started, there is nothing to
 * default to and a bare link is all time.
 */
function scopes(metas: readonly MetaRow[], now: number) {
	const newestFirst = [...metas].sort((a, b) => b.startsOn.getTime() - a.startsOn.getTime());
	const current = newestFirst.find((meta) => meta.startsOn.getTime() <= now);
	const named = (meta: MetaRow): Period => ({
		id: meta.id,
		name: meta.name,
		from: meta.startsOn.getTime(),
		to: meta.endsOn ? meta.endsOn.getTime() : null,
		// The default is what a link says by saying nothing, so it adds no param to any link.
		param: meta.id === current?.id ? null : String(meta.id),
		...ANY_EVENTS
	});
	const everything: Period = { ...ALL_TIME, param: current ? 'all' : null };
	return {
		choices: [...newestFirst.map(named), everything],
		named,
		everything,
		current: current ? named(current) : everything
	};
}

/** The metas newest first, then all time: the order a selector shows them in. */
export const periodChoices = (metas: readonly MetaRow[], now = Date.now()): Period[] =>
	scopes(metas, now).choices;

/** What `?period=` asks for: a meta id, `all`, or (anything else, or nothing) the default. */
export function resolvePeriod(
	metas: readonly MetaRow[],
	asked: string | null,
	narrowing: Narrowing = ANY_EVENTS,
	now = Date.now()
): Period {
	const { named, everything, current } = scopes(metas, now);
	const meta =
		asked !== null && /^\d{1,9}$/.test(asked)
			? metas.find((m) => m.id === Number(asked))
			: undefined;
	const chosen = asked === 'all' ? everything : meta ? named(meta) : current;
	return { ...chosen, ...narrowing };
}
