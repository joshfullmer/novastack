<script lang="ts">
	/**
	 * The card database.
	 *
	 * **The URL is the only source of truth**, query box included, and results are `$derived`
	 * from it — nothing is stored:
	 *
	 * ```
	 * currentUrl().searchParams → parseQueryState → evaluate → sortMatches
	 * ```
	 *
	 * `?q=` is parsed by the query language (`#lib/query/index.js`) into `{ predicate, warnings }`
	 * (spec §6, §7); the chip panel reads that same predicate back through `readChipView`
	 * (`#lib/filters/chips.js`) to decide, per facet, whether it's interactive or read-only
	 * (spec §9). No memoization — at 133 cards the whole pipeline is a few hundred comparisons.
	 *
	 * **Updates use shallow routing.** In SvelteKit 3 that means `goto(url, { shallow: true })`,
	 * not the deprecated `pushState`/`replaceState`. No `load` depends on the URL, so this fetches
	 * nothing; and because `reset` defaults to `false` under `shallow`, scroll and focus are left
	 * alone — which is what makes a chip click feel like a filter rather than a page change.
	 *
	 * The URL is read through `currentUrl()`, **not** `page.url`: a shallow navigation deliberately
	 * leaves `page.url` on the loaded page and exposes the new URL at `page.shallow.url`. See
	 * `#lib/filters/shallow.js`.
	 *
	 * **First paint of a filtered link shows everything.** This page prerenders with all tiles and
	 * narrows on hydration, so a shared filtered link is briefly wide. That is hydration latency,
	 * not load latency — the data is local, and static HTML cannot know the query string.
	 */
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { MediaQuery } from 'svelte/reactivity';
	import { innerWidth } from 'svelte/reactivity/window';
	import { currentUrl } from '#lib/filters/shallow.js';
	import { dataset } from '#lib/cards/index.js';
	import { setExclusiveSlugs } from '#lib/cards/derive.js';
	import CardPane from '#lib/components/CardPane.svelte';
	import CardTile from '#lib/components/CardTile.svelte';
	import FilterBar from '#lib/components/filters/FilterBar.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import { budgetFromLegendColors, EMPTY_BUDGET } from '#lib/filters/budget.js';
	import { readChipView } from '#lib/filters/chips.js';
	import { evaluate } from '#lib/filters/predicate.js';
	import { withFacetEdit, type FacetEdit } from '#lib/filters/query-edit.js';
	import { sortMatches } from '#lib/filters/sort.js';
	import type { Sort } from '#lib/filters/sort.js';
	import {
		EMPTY_QUERY_STATE,
		isFiltered,
		parseQueryState,
		toQueryUrl
	} from '#lib/filters/state.js';
	import { persistedIntState } from '#lib/persisted-state.svelte.js';

	let { data } = $props();

	const SEARCH_DEBOUNCE_MS = 250;
	const DEFAULT_COLUMNS = 6;
	const COLUMN_STEP = 1;
	const COLUMN_FLOOR = 2;
	const COLUMN_CEILING = 12;
	/** Below this, the three-pane layout fails: at 390px the pane crushed the grid to ~55px. */
	const NARROW_COLUMN_CEILING = 3;
	/** Roughly the narrowest a tile can get and still be recognisable. */
	const MIN_TILE_PX = 104;

	const setExclusiveCount = setExclusiveSlugs(dataset.cards).length;

	/**
	 * The query string is read **only in the browser**, and this is not a workaround — it is the
	 * prerendering decision made literal. Prerendered HTML cannot depend on a query string (Kit
	 * throws if you try), so the static page is the *unfiltered* grid and narrowing happens on
	 * hydration. That is why a shared filtered link is briefly wide.
	 */
	const queryState = $derived(
		browser ? parseQueryState(currentUrl().searchParams, dataset) : EMPTY_QUERY_STATE
	);
	const chipView = $derived(readChipView(queryState.predicate, dataset));
	const budget = $derived(
		chipView.legendColors.interactive
			? budgetFromLegendColors(chipView.legendColors.value, dataset.ramPerLegend)
			: EMPTY_BUDGET
	);
	const results = $derived(
		sortMatches(dataset, evaluate(dataset, queryState.predicate), queryState.sort)
	);
	const filtered = $derived(isFiltered(queryState.source));

	const isDesktop = new MediaQuery('min-width: 64rem', false);

	// Density is a column count, not a tile size. It is local state rather than URL state: it is a
	// view preference, and a shared link should carry the *query*, not the reader's zoom level.
	// Persisted as the user's actual preference — the *unclamped* value — so a narrow window
	// doesn't permanently ratchet it down for every future, wider visit too.
	const desiredColumns = persistedIntState('cards-columns', DEFAULT_COLUMNS, {
		min: COLUMN_FLOOR,
		max: COLUMN_CEILING
	});

	/**
	 * A fixed 8 columns is nonsense at 390px, so the count is clamped by viewport. The floor at
	 * `COLUMN_FLOOR` is what keeps the derived tile width from ever going to zero.
	 */
	const columnCeiling = $derived.by(() => {
		const width = innerWidth.current;
		if (width === undefined) return COLUMN_CEILING;
		if (width < 640) return NARROW_COLUMN_CEILING;
		return Math.max(COLUMN_FLOOR, Math.min(COLUMN_CEILING, Math.floor(width / MIN_TILE_PX)));
	});

	const columns = $derived(Math.max(COLUMN_FLOOR, Math.min(desiredColumns.value, columnCeiling)));
	const columnRange = $derived({ min: COLUMN_FLOOR, max: columnCeiling });

	function setColumns(next: number) {
		desiredColumns.value = next;
	}

	// Keeps `--cards-columns` live for `app.html`'s CSS rule (`[data-columns-grid='cards']`),
	// which is the *only* thing setting `grid-template-columns` on that element — there's no
	// competing inline `style` binding below to fight over specificity with (an inline style
	// attribute always beats an external rule regardless of specificity, `!important` aside, so
	// having both was never going to let the CSS rule win). Synced from `columns`, the
	// viewport-clamped value, not the raw stored preference — the rendered grid must never
	// exceed what the current viewport actually fits.
	$effect(() => {
		document.documentElement.style.setProperty('--cards-columns', String(columns));
	});

	/** Measured so `CardPane`'s sticky offset sits flush under FilterBar's sticky query row —
	 * the chip panel isn't sticky, so it doesn't factor into this. */
	let filterBarHeight = $state(0);

	/** Tiles stretch to fill, so the browser picks a tier from roughly this width. */
	const tileSizes = $derived(`calc(100vw / ${columns})`);

	let selectedSlug = $state<string | null>(null);

	/** A selection that has been filtered away is stale, and showing it would be a lie. */
	const selected = $derived(results.find((match) => match.card.slug === selectedSlug) ?? null);

	function apply(source: string, sort: Sort, options: { replace?: boolean } = {}) {
		// A chip click gets its own history entry, so Back is filter-undo.
		void goto(toQueryUrl(currentUrl(), source, sort), { shallow: true, replace: options.replace });
	}

	function onFacetEdit(edit: FacetEdit) {
		apply(withFacetEdit(queryState.source, dataset, edit), queryState.sort);
	}

	function onSort(sort: Sort) {
		apply(queryState.source, sort);
	}

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function onSource(value: string) {
		// Debounced and history-replacing: one entry per pause in typing, not one per keystroke.
		clearTimeout(searchTimer);
		searchTimer = setTimeout(
			() => apply(value, queryState.sort, { replace: true }),
			SEARCH_DEBOUNCE_MS
		);
	}

	function clearAll() {
		// A `goto` rather than an `<a href="/cards">`: in v3 a link to the current location
		// triggers `refreshAll()`, which would rerun loads for a filter reset.
		void goto('/cards', { shallow: true });
	}
</script>

<Meta
	title="Cards — novastack"
	description="Browse and filter every card in the Cyberpunk TCG."
	origin={data.origin}
	path="/cards"
/>

<!--
	The page scrolls normally and the pane is sticky, rather than the grid living in its own scroll
	container. That keeps the footer reachable, keeps browser find-in-page working across the whole
	grid, and needs no viewport arithmetic to stay correct on a phone.

	`data-hydrated` marks the prerender/hydration boundary. It is not decoration: the prerendered
	grid *looks* interactive — every chip is in the static HTML — while none of the handlers are
	attached and the filters have not been read from the URL yet. Making that boundary observable
	is what lets the end-to-end suite wait for it rather than race it, and it is the hook a
	pre-paint narrowing script would key off if one is ever added.
-->
<div data-hydrated={browser ? 'true' : undefined}>
	<FilterBar
		{dataset}
		source={queryState.source}
		view={chipView}
		warnings={queryState.warnings}
		{budget}
		sort={queryState.sort}
		{filtered}
		{setExclusiveCount}
		{onSource}
		{onFacetEdit}
		{onSort}
		onClear={clearAll}
		bind:height={filterBarHeight}
	/>

	<div class="mx-auto flex max-w-[1800px] items-start">
		<div class="min-w-0 flex-1 p-4 sm:p-6">
			<!-- Non-sticky and single-line by design: this is glanced at, not referenced while
				scrolling, so it doesn't earn a persistent chrome layer of its own. -->
			<div class="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
				<div class="flex items-center gap-2">
					<span class="tracking-wide uppercase">Per row</span>
					<div class="inline-flex items-center overflow-hidden rounded-md border border-edge">
						<button
							type="button"
							onclick={() => setColumns(columns - COLUMN_STEP)}
							disabled={columns <= columnRange.min}
							aria-label="Fewer, larger cards"
							class="px-2 py-0.5 text-body hover:bg-raised disabled:opacity-30">−</button
						>
						<span class="w-6 text-center tabular-nums">{columns}</span>
						<button
							type="button"
							onclick={() => setColumns(columns + COLUMN_STEP)}
							disabled={columns >= columnRange.max}
							aria-label="More, smaller cards"
							class="px-2 py-0.5 text-body hover:bg-raised disabled:opacity-30">+</button
						>
					</div>
				</div>

				<p aria-live="polite" class="shrink-0 tabular-nums">{results.length} of {dataset.stats.cards}</p>
			</div>

			{#if results.length === 0}
				<div class="mx-auto mt-16 max-w-md text-center">
					<p class="text-lg text-bright">No cards match these filters.</p>
					<p class="mt-2 text-sm text-balance text-muted">
						Filters combine with AND across facets, so a narrow combination can empty the grid.
						Widening one facet usually brings results back.
					</p>
					{#if filtered}
						<button
							type="button"
							onclick={clearAll}
							class="mt-4 rounded-lg border border-edge px-3 py-2 text-sm
								text-body transition-colors hover:border-neon hover:text-neon">Clear all filters</button
						>
					{/if}
				</div>
			{:else}
				<ul data-columns-grid="cards" class="grid gap-2 sm:gap-3">
					{#each results as match, index (match.card.slug)}
						<li>
							<CardTile
								card={match.card}
								printing={match.printing}
								selected={match.card.slug === selectedSlug}
								sizes={tileSizes}
								eager={index < columns}
								onSelect={() => {
									// On a phone the pane does not exist, so the link navigates instead.
									if (!isDesktop.current) return false;
									// Clicking an already-selected tile follows the link. The first click reads
									// the card in the pane; the second says "I want the whole thing" — and it
									// means the tile never becomes an inert target once selected.
									if (selectedSlug === match.card.slug) return false;
									selectedSlug = match.card.slug;
									return true;
								}}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<CardPane
			card={selected?.card ?? null}
			printing={selected?.printing ?? null}
			{filterBarHeight}
		/>
	</div>
</div>
