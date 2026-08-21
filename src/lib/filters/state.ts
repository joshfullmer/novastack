/**
 * Filter state, encoded in the URL (spec §7).
 *
 * **`?q=` is the only filter param.** Per-facet params (`?color=`, `?cost=`, …) are gone —
 * replaced, not maintained alongside, per the map's settled "full parity" note. `?sort=` stays
 * completely untouched (spec §5): same format, same absent-means-default encoding, because
 * sorting isn't a filter and the grammar was never built to admit the question.
 *
 * ```
 * page.url.searchParams.get('q') → parseQuery → { predicate, warnings } → evaluate(dataset)
 * ```
 *
 * **A cleared query is an absent `?q=`, never an empty one** — same canonicality property stage
 * 1 had. Malformed input degrades (never throws) inside `parseQuery` itself; an old-style
 * `?color=red` link is simply an unrecognised param now, needing no migration code at all (spec
 * §10) — the same mechanism as any other unrecognised query string.
 */
import * as v from 'valibot';
import type { Dataset } from '#lib/cards/dataset.js';
import { parseQuery, type ParseWarning } from '#lib/query/index.js';
import type { Predicate } from './predicate.js';
import { DEFAULT_SORT, SORT_DIRECTIONS, SORT_KEYS, type Sort } from './sort.js';

/** Anything that can answer `get`. Avoids depending on the exact class SvelteKit hands us. */
export type ReadableParams = { get(name: string): string | null };

export const PARAM = { query: 'q', sort: 'sort' } as const;

export type QueryState = {
	/** The raw text — what the query box shows and edits. */
	source: string;
	predicate: Predicate;
	warnings: readonly ParseWarning[];
	sort: Sort;
};

export const EMPTY_QUERY_STATE: QueryState = {
	source: '',
	predicate: { kind: 'all' },
	warnings: [],
	sort: DEFAULT_SORT
};

function readSort(params: ReadableParams): Sort {
	const raw = params.get(PARAM.sort);
	if (raw === null) return DEFAULT_SORT;

	const [key, direction = 'asc'] = raw.trim().toLowerCase().split('-');
	const parsed = v.safeParse(
		v.object({ key: v.picklist(SORT_KEYS), direction: v.picklist(SORT_DIRECTIONS) }),
		{ key, direction }
	);
	return parsed.success ? parsed.output : DEFAULT_SORT;
}

export function parseQueryState(params: ReadableParams, dataset: Dataset): QueryState {
	const source = (params.get(PARAM.query) ?? '').trim();
	const { predicate, warnings } = parseQuery(source, dataset);
	return { source, predicate, warnings, sort: readSort(params) };
}

/**
 * The canonical URL for a given query text and sort, built from the current location.
 *
 * Takes only `href` because `page.url` is a `ReadonlyURL` in SvelteKit 3 — its `searchParams`
 * has no `set`/`append`/`delete` — so the next URL has to be constructed from the href rather
 * than mutated in place.
 */
export function toQueryUrl(current: { readonly href: string }, source: string, sort: Sort): URL {
	const next = new URL(current.href);
	const params = new URLSearchParams();

	const trimmed = source.trim();
	if (trimmed !== '') params.set(PARAM.query, trimmed);

	// The default sort is an absent param, so "no sort chosen" has one canonical URL.
	if (sort.key !== DEFAULT_SORT.key || sort.direction !== DEFAULT_SORT.direction) {
		params.set(PARAM.sort, `${sort.key}-${sort.direction}`);
	}

	next.search = params.toString();
	return next;
}

/** True as soon as there's a query — which is exactly when "clear all" should appear. Sort
 * alone is not a filter (spec §5), so it's deliberately excluded here, same as stage 1. */
export function isFiltered(source: string): boolean {
	return source.trim() !== '';
}
