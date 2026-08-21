/**
 * Filter state, encoded in the URL.
 *
 * **The URL is the only source of truth**, search box included — one code path, so there is no
 * possibility of two truths diverging. Results are `$derived` from it and nothing is stored:
 *
 * ```
 * page.url.searchParams → parseFilterState → toPredicate → evaluate(dataset)
 * ```
 *
 * **A cleared filter is an absent param, never an empty one**, so each filter combination has
 * exactly one canonical URL. Unknown facet values and malformed ranges are **dropped, not
 * thrown**: a mangled shared link should degrade to a wider result set, not an error page.
 *
 * Per-facet params are what `?q=` will *replace* when the query language ships — not something
 * it will be maintained alongside.
 */
import * as v from 'valibot';
import type { Dataset } from '#lib/cards/dataset.js';
import {
	CARD_TYPES,
	CardTypeSchema,
	COLORS,
	ColorSchema,
	KEYWORDS,
	KeywordSchema,
	RARITY_ORDER,
	RaritySchema,
	type Color
} from '#lib/cards/vocabulary.js';
import { budgetFromLegendColors, isEmptyBudget } from './budget.js';
import { and, type Predicate } from './predicate.js';
import { DEFAULT_SORT, SORT_DIRECTIONS, SORT_KEYS, type Sort } from './sort.js';

/** Anything that can answer `get`. Avoids depending on the exact class SvelteKit hands us. */
export type ReadableParams = { get(name: string): string | null };

export const PARAM = {
	search: 'search',
	color: 'color',
	type: 'type',
	keywords: 'keywords',
	tags: 'tags',
	rarity: 'rarity',
	set: 'set',
	cost: 'cost',
	power: 'power',
	ram: 'ram',
	eddiable: 'eddiable',
	legends: 'legends',
	sort: 'sort'
} as const;

/** `null` bounds mean unbounded — a thumb parked at a domain edge. A bound never admits null. */
export const NumericRangeSchema = v.object({
	min: v.nullable(v.number()),
	max: v.nullable(v.number()),
	/** The explicit `+ none` bucket. Defaults to admitted, because bare `/cards` shows every card. */
	includeNull: v.boolean()
});
export type NumericRange = v.InferOutput<typeof NumericRangeSchema>;

export const UNFILTERED_RANGE: NumericRange = { min: null, max: null, includeNull: true };

export const FilterStateSchema = v.object({
	search: v.string(),
	colors: v.array(ColorSchema),
	cardTypes: v.array(CardTypeSchema),
	keywords: v.array(KeywordSchema),
	classifications: v.array(v.string()),
	rarities: v.array(RaritySchema),
	setIds: v.array(v.string()),
	cost: NumericRangeSchema,
	power: NumericRangeSchema,
	ram: NumericRangeSchema,
	/** `null` is "no filter"; the toggle is tri-state in effect, binary in appearance. */
	eddiable: v.nullable(v.boolean()),
	/** Up to three. Order is cosmetic — only the per-colour counts affect the budget. */
	legendColors: v.pipe(v.array(ColorSchema), v.maxLength(3)),
	sort: v.object({ key: v.picklist(SORT_KEYS), direction: v.picklist(SORT_DIRECTIONS) })
});
export type FilterState = v.InferOutput<typeof FilterStateSchema>;

export const EMPTY_STATE: FilterState = {
	search: '',
	colors: [],
	cardTypes: [],
	keywords: [],
	classifications: [],
	rarities: [],
	setIds: [],
	cost: UNFILTERED_RANGE,
	power: UNFILTERED_RANGE,
	ram: UNFILTERED_RANGE,
	eddiable: null,
	legendColors: [],
	sort: DEFAULT_SORT
};

// ---------------------------------------------------------------------------
// Value slugs
// ---------------------------------------------------------------------------

/** `Iconic Legend` → `iconic-legend`. Chip labels are display text; URLs are slugs. */
export function slugifyValue(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function slugLookup(values: readonly string[]): Map<string, string> {
	return new Map(values.map((value) => [slugifyValue(value), value]));
}

/**
 * Reads a comma-joined list, keeping only values the vocabulary knows. Repeating a param is
 * *not* supported: the source API fails open on `?color=Red&color=Blue`, and one comma-joined
 * param per facet is the only encoding with a single canonical form.
 */
function readList(
	params: ReadableParams,
	name: string,
	vocabulary: ReadonlyMap<string, string>
): string[] {
	const raw = params.get(name);
	if (raw === null || raw === '') return [];

	const seen = new Set<string>();
	for (const token of raw.split(',')) {
		const value = vocabulary.get(token.trim().toLowerCase());
		if (value !== undefined) seen.add(value);
	}
	return [...seen];
}

function writeList(values: readonly string[]): string {
	return values.map(slugifyValue).join(',');
}

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

const BOUNDS = /^(\d*)-(\d*)$/;
const EXACT = /^\d+$/;

/**
 * Grammar, comma-joined: at most one bounds token plus an optional null token.
 *
 * ```
 * ?cost=2-4        2 ≤ cost ≤ 4, nulls excluded
 * ?cost=2-4,none   that range, or no cost at all
 * ?cost=-4         cost ≤ 4
 * ?cost=3          exactly 3 — canonicalises to 3-3 on the way out
 * ?cost=has        has a cost, no bounds
 * (absent)         no filter
 * ```
 */
function readRange(params: ReadableParams, name: string): NumericRange {
	const raw = params.get(name);
	if (raw === null || raw === '') return UNFILTERED_RANGE;

	let min: number | null = null;
	let max: number | null = null;
	let includeNull: boolean | null = null;
	let bounded = false;

	for (const token of raw.split(',').map((part) => part.trim().toLowerCase())) {
		if (token === 'none') {
			includeNull = true;
			continue;
		}
		if (token === 'has') {
			includeNull = false;
			continue;
		}

		const exact = token.match(EXACT);
		if (exact !== null) {
			min = Number(token);
			max = Number(token);
			bounded = true;
			continue;
		}

		const bounds = token.match(BOUNDS);
		if (bounds !== null) {
			min = bounds[1] === '' ? null : Number(bounds[1]);
			max = bounds[2] === '' ? null : Number(bounds[2]);
			bounded = true;
			continue;
		}
		// Anything else is malformed and is dropped, not thrown.
	}

	// A bounded range excludes nulls unless `none` says otherwise; an unbounded param that said
	// nothing about nulls narrows nothing, so it degrades to no filter.
	if (!bounded && includeNull === null) return UNFILTERED_RANGE;
	if (min !== null && max !== null && min > max) return UNFILTERED_RANGE;

	return { min, max, includeNull: includeNull ?? !bounded };
}

function writeRange(range: NumericRange): string | null {
	const unbounded = range.min === null && range.max === null;
	if (unbounded) return range.includeNull ? null : 'has';

	const bounds = `${range.min ?? ''}-${range.max ?? ''}`;
	return range.includeNull ? `${bounds},none` : bounds;
}

export function isRangeActive(range: NumericRange): boolean {
	return writeRange(range) !== null;
}

// ---------------------------------------------------------------------------
// Parse and serialize
// ---------------------------------------------------------------------------

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

/**
 * Parses the URL into the typed inputs the predicate tree consumes.
 *
 * The dataset is required because two vocabularies are data, not constants: Set ids come from
 * the curated map and classifications from the cards themselves. Validating against them is
 * what makes `?tags=bogus` degrade to a wider result set instead of an empty grid.
 */
export function parseFilterState(params: ReadableParams, dataset: Dataset): FilterState {
	const setVocabulary = slugLookup(dataset.sets.map((set) => set.id));
	const classificationVocabulary = slugLookup(dataset.classifications.map((facet) => facet.value));

	return v.parse(FilterStateSchema, {
		search: (params.get(PARAM.search) ?? '').trim(),
		colors: readList(params, PARAM.color, slugLookup(COLORS)),
		cardTypes: readList(params, PARAM.type, slugLookup(CARD_TYPES)),
		keywords: readList(params, PARAM.keywords, slugLookup(KEYWORDS)),
		classifications: readList(params, PARAM.tags, classificationVocabulary),
		rarities: readList(params, PARAM.rarity, slugLookup(RARITY_ORDER)),
		setIds: readList(params, PARAM.set, setVocabulary),
		cost: readRange(params, PARAM.cost),
		power: readRange(params, PARAM.power),
		ram: readRange(params, PARAM.ram),
		eddiable: readBoolean(params.get(PARAM.eddiable)),
		legendColors: readLegendColors(params),
		sort: readSort(params)
	});
}

function readBoolean(raw: string | null): boolean | null {
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	return null;
}

function readLegendColors(params: ReadableParams): Color[] {
	const raw = params.get(PARAM.legends);
	if (raw === null || raw === '') return [];

	const vocabulary = slugLookup(COLORS);
	const colors: Color[] = [];
	for (const token of raw.split(',')) {
		const value = vocabulary.get(token.trim().toLowerCase());
		const parsed = v.safeParse(ColorSchema, value);
		if (parsed.success && colors.length < 3) colors.push(parsed.output);
	}
	return sortColors(colors);
}

/** Slots are ordered on screen but unordered in effect, so the canonical form is sorted. */
function sortColors(colors: readonly Color[]): Color[] {
	return [...colors].sort((a, b) => COLORS.indexOf(a) - COLORS.indexOf(b));
}

export function toSearchParams(state: FilterState): URLSearchParams {
	const params = new URLSearchParams();
	const set = (name: string, value: string | null) => {
		if (value !== null && value !== '') params.set(name, value);
	};

	set(PARAM.search, state.search.trim());
	set(PARAM.color, writeList(state.colors));
	set(PARAM.type, writeList(state.cardTypes));
	set(PARAM.keywords, writeList(state.keywords));
	set(PARAM.tags, writeList(state.classifications));
	set(PARAM.rarity, writeList(state.rarities));
	set(PARAM.set, writeList(state.setIds));
	set(PARAM.cost, writeRange(state.cost));
	set(PARAM.power, writeRange(state.power));
	set(PARAM.ram, writeRange(state.ram));
	set(PARAM.eddiable, state.eddiable === null ? null : String(state.eddiable));
	set(PARAM.legends, writeList(sortColors(state.legendColors)));

	// The default sort is an absent param, so "no sort chosen" has one canonical URL.
	if (state.sort.key !== DEFAULT_SORT.key || state.sort.direction !== DEFAULT_SORT.direction) {
		set(PARAM.sort, `${state.sort.key}-${state.sort.direction}`);
	}

	params.sort();
	return params;
}

/**
 * The query string as it should appear in the address bar.
 *
 * `URLSearchParams.toString()` percent-encodes commas, which would turn every shared link into
 * `?color=red%2Cblue`. A comma is a legal sub-delimiter in a query string, and decoding it back
 * is unambiguous here: it round-trips through `URLSearchParams` identically, including inside a
 * search term.
 */
export function toQueryString(state: FilterState): string {
	return toSearchParams(state).toString().replaceAll('%2C', ',');
}

/**
 * The canonical URL for a filter state, built from the current location.
 *
 * Takes only `href` because `page.url` is a `ReadonlyURL` in SvelteKit 3 — its `searchParams`
 * has no `set`/`append`/`delete` — so the next URL has to be constructed from the href rather
 * than mutated in place.
 */
export function toFilteredUrl(current: { readonly href: string }, state: FilterState): URL {
	const next = new URL(current.href);
	next.search = toQueryString(state);
	return next;
}

/** True when any filter is engaged — which is exactly when "clear all" should appear. */
export function isFiltered(state: FilterState): boolean {
	return [...toSearchParams(state).keys()].some((key) => key !== PARAM.sort);
}

// ---------------------------------------------------------------------------
// State → predicate
// ---------------------------------------------------------------------------

const listPredicate = <T>(
	values: readonly T[],
	build: (values: readonly T[]) => Predicate
): Predicate => (values.length === 0 ? { kind: 'all' } : build(values));

const rangePredicate = (field: 'cost' | 'power' | 'ram', range: NumericRange): Predicate =>
	isRangeActive(range)
		? { kind: 'numeric', field, min: range.min, max: range.max, includeNull: range.includeNull }
		: { kind: 'all' };

export function toPredicate(dataset: Dataset, state: FilterState): Predicate {
	const budget = budgetFromLegendColors(state.legendColors, dataset.ramPerLegend);

	return and([
		state.search === '' ? { kind: 'all' } : { kind: 'text', query: state.search },
		listPredicate(state.colors, (values) => ({ kind: 'color', values })),
		listPredicate(state.cardTypes, (values) => ({ kind: 'cardType', values })),
		listPredicate(state.keywords, (values) => ({ kind: 'keyword', values })),
		listPredicate(state.classifications, (values) => ({ kind: 'classification', values })),
		listPredicate(state.rarities, (values) => ({ kind: 'rarity', values })),
		listPredicate(state.setIds, (values) => ({ kind: 'set', values })),
		rangePredicate('cost', state.cost),
		rangePredicate('power', state.power),
		rangePredicate('ram', state.ram),
		state.eddiable === null ? { kind: 'all' } : { kind: 'eddiable', value: state.eddiable },
		isEmptyBudget(budget) ? { kind: 'all' } : { kind: 'ramBudget', budget }
	]);
}
