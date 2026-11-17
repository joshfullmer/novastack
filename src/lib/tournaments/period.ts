/**
 * The scope every statistic is cut by: a window (all time, or one `metas` row; `docs/spec/tournaments.md`
 * §3) and, optionally, which events count (a kind, a minimum field size).
 *
 * A Tournament belongs to a period when its start falls in `[from, to)`: **derived, never assigned**,
 * so moving a meta's dates needs no edit to any event. The choice lives in `?period=<meta id>` so a link
 * carries it, and anything unrecognised means all time rather than an error.
 */
import { EVENT_KINDS, type EventKind } from './kind.ts';

/** The field sizes the stats pages offer as a floor ("only events with 16 or more players"). */
export const FIELD_FLOORS = [8, 16, 32, 64] as const;

/** What a statistic is narrowed to beyond its dates: which events count at all. */
export type Narrowing = {
	/** Only events of this kind; null for any. */
	kind: EventKind | null;
	/** Only events with at least this many players; null for any. */
	minPlayers: number | null;
};

export const ANY_EVENTS: Narrowing = { kind: null, minPlayers: null };

/** `?kind=` and `?min=`, with anything unrecognised meaning "any" rather than an error. */
export function parseNarrowing(params: URLSearchParams): Narrowing {
	const kind = params.get('kind');
	const min = Number(params.get('min'));
	return {
		kind: EVENT_KINDS.find((k) => k === kind) ?? null,
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
};

export const ALL_TIME: Period = { id: null, name: 'All time', from: null, to: null, ...ANY_EVENTS };

const fromMeta = (meta: MetaRow): Period => ({
	id: meta.id,
	name: meta.name,
	from: meta.startsOn.getTime(),
	to: meta.endsOn ? meta.endsOn.getTime() : null,
	...ANY_EVENTS
});

/** The query that carries a period and its narrowing from one link to the next. */
export const periodParams = (period: Period) => ({
	period: period.id,
	kind: period.kind,
	min: period.minPlayers
});

/** All time first, then the metas newest first: the order a selector shows them in. */
export function periodChoices(metas: readonly MetaRow[]): Period[] {
	return [
		ALL_TIME,
		...[...metas].sort((a, b) => b.startsOn.getTime() - a.startsOn.getTime()).map(fromMeta)
	];
}

export function resolvePeriod(
	metas: readonly MetaRow[],
	asked: string | null,
	narrowing: Narrowing = ANY_EVENTS
): Period {
	const meta =
		asked !== null && /^\d{1,9}$/.test(asked)
			? metas.find((m) => m.id === Number(asked))
			: undefined;
	return { ...(meta ? fromMeta(meta) : ALL_TIME), ...narrowing };
}
