<script lang="ts">
	/**
	 * The header band over the grid.
	 *
	 * Layout follows the spec's split, which reads better than a strict importance ranking:
	 *
	 * - **Search as the hero**, full width, with the result count and a clear-all beside it.
	 * - **Row 1 — categorical.** Color, Type, Keywords.
	 * - **Row 2 — numeric and scoping.** Cost / Power / RAM, Eddiable, the Legend color slots,
	 *   density, sort.
	 * - **Disclosure.** Tags, Rarity, Sets behind "More filters".
	 *
	 * The facet is called **Eddiable**, not "sellable" — that is the project's term for a card
	 * that can be sold, and the glossary wins over the source API's `is_eddiable`.
	 *
	 * The result count is announced through a polite live region: a grid narrowing silently is
	 * invisible to a screen reader.
	 */
	import type { Dataset } from '#lib/cards/dataset.js';
	import {
		KEYWORDS,
		type CardType,
		type Color,
		type Keyword,
		type Rarity
	} from '#lib/cards/vocabulary.js';
	import type { ColorBudget } from '#lib/filters/budget.js';
	import type { FilterState } from '#lib/filters/state.js';
	import { SORT_KEYS, SORT_LABELS, type Sort, type SortKey } from '#lib/filters/sort.js';
	import { COLOR_CHIP_OFF, COLOR_CHIP_ON } from '../color.js';
	import ChipGroup from './ChipGroup.svelte';
	import LegendSlots from './LegendSlots.svelte';
	import RangeControl from './RangeControl.svelte';
	import SetList from './SetList.svelte';
	import TagList from './TagList.svelte';

	let {
		dataset,
		filters,
		budget,
		resultCount,
		setExclusiveCount,
		columns,
		columnRange,
		columnStep,
		filtered,
		onUpdate,
		onSearch,
		onColumns,
		onClear
	}: {
		dataset: Dataset;
		filters: FilterState;
		budget: ColorBudget;
		resultCount: number;
		setExclusiveCount: number;
		columns: number;
		columnRange: { min: number; max: number };
		columnStep: number;
		filtered: boolean;
		onUpdate: (patch: Partial<FilterState>) => void;
		onSearch: (value: string) => void;
		onColumns: (next: number) => void;
		onClear: () => void;
	} = $props();

	let showMore = $state(false);

	let searchEl = $state<HTMLInputElement>();

	/**
	 * The search box holds its own text, rather than rendering `filters.search` directly.
	 *
	 * The URL is still the only source of truth for *results* — this is about the caret. Writing
	 * the URL's value straight back into the input means that every debounced push re-renders the
	 * box, and any keystroke landing inside that window gets overwritten by the older string. The
	 * box is the one control the reader is mid-gesture with, so it wins while it has focus.
	 *
	 * When focus is elsewhere the URL does win, which is what keeps Back, clear-all and a shared
	 * link in sync with what the box shows.
	 */
	let searchText = $state('');

	// Seeded and resynced here rather than at declaration, so a shared `?search=` link fills the
	// box on mount and the two paths stay one path.
	$effect(() => {
		const fromUrl = filters.search;
		if (searchEl !== document.activeElement) searchText = fromUrl;
	});

	/**
	 * Below the breakpoint the filter rows collapse behind a single button. At 390px the expanded
	 * header consumed ~350px of an 844px viewport — the controls were pushing the grid off screen.
	 */
	let showFilters = $state(false);

	const activeFacetCount = $derived(
		[
			filters.colors.length,
			filters.cardTypes.length,
			filters.keywords.length,
			filters.classifications.length,
			filters.rarities.length,
			filters.setIds.length,
			filters.legendColors.length
		].reduce((total, count) => total + Math.min(count, 1), 0) +
			[filters.cost, filters.power, filters.ram].filter(
				(range) => range.min !== null || range.max !== null || !range.includeNull
			).length +
			(filters.eddiable === null ? 0 : 1)
	);

	/** Toggling a value in a facet's list. OR within a facet, so this is set membership. */
	function toggle<T>(values: readonly T[], value: T): T[] {
		return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
	}

	const colorOptions = $derived(
		dataset.colorOrder.map((color) => ({ value: color, label: color }))
	);
	const typeOptions = $derived(
		dataset.cardTypeOrder.map((cardType) => ({ value: cardType, label: cardType }))
	);
	const keywordOptions = KEYWORDS.map((keyword) => ({ value: keyword, label: keyword }));
	const rarityOptions = $derived(
		dataset.rarities.map((rarity) => ({ value: rarity, label: rarity }))
	);

	const eddiableOptions = [
		{ value: null, label: 'Any' },
		{ value: true, label: 'Yes' },
		{ value: false, label: 'No' }
	] as const;

	function setSort(key: SortKey) {
		// Clicking the active key flips direction; the default sort has no meaningful direction.
		const direction: Sort['direction'] =
			filters.sort.key === key && key !== 'default' && filters.sort.direction === 'asc'
				? 'desc'
				: 'asc';
		onUpdate({ sort: { key, direction } });
	}
</script>

<div class="sticky top-nav z-20 border-b border-edge/60 bg-shell/85 backdrop-blur-md">
	<div class="mx-auto max-w-[1800px] space-y-3 px-4 py-3 sm:px-6">
		<!-- Search as the hero -->
		<div class="flex items-center gap-3">
			<div class="relative flex-1">
				<label for="grid-search" class="sr-only">Search cards</label>
				<input
					id="grid-search"
					bind:this={searchEl}
					value={searchText}
					oninput={(event) => {
						searchText = event.currentTarget.value;
						onSearch(searchText);
					}}
					type="search"
					placeholder="Search names and rules text…"
					autocomplete="off"
					class="w-full rounded-lg border border-edge bg-void px-4
						py-2.5 text-bright transition-colors outline-none placeholder:text-muted focus:border-neon"
				/>
			</div>

			<p aria-live="polite" class="shrink-0 text-sm text-muted tabular-nums">
				{resultCount} of {dataset.stats.cards}
			</p>

			{#if filtered}
				<button
					type="button"
					onclick={onClear}
					class="shrink-0 rounded-lg border border-edge px-3 py-2 text-sm
						text-muted transition-colors hover:border-neon hover:text-neon"
				>
					Clear all
				</button>
			{/if}
		</div>

		<!-- One button collapses every control below the breakpoint. -->
		<button
			type="button"
			onclick={() => (showFilters = !showFilters)}
			aria-expanded={showFilters}
			class="flex w-full items-center justify-between rounded-lg border border-edge
				px-3 py-2 text-sm text-body transition-colors hover:border-neon lg:hidden"
		>
			<span
				>Filters{#if activeFacetCount > 0}<span class="text-neon">
						· {activeFacetCount} active</span
					>{/if}</span
			>
			<span aria-hidden="true">{showFilters ? '−' : '+'}</span>
		</button>

		<div class="space-y-3 {showFilters ? 'block' : 'hidden'} lg:block">
			<!-- Row 1 — categorical -->
			<div class="flex flex-wrap gap-x-6 gap-y-3">
				<ChipGroup
					legend="Color"
					options={colorOptions}
					selected={filters.colors}
					tintOn={COLOR_CHIP_ON}
					tintOff={COLOR_CHIP_OFF}
					onToggle={(color: Color) => onUpdate({ colors: toggle(filters.colors, color) })}
				/>
				<ChipGroup
					legend="Type"
					options={typeOptions}
					selected={filters.cardTypes}
					onToggle={(cardType: CardType) =>
						onUpdate({ cardTypes: toggle(filters.cardTypes, cardType) })}
				/>
				<ChipGroup
					legend="Keywords"
					options={keywordOptions}
					selected={filters.keywords}
					onToggle={(keyword: Keyword) => onUpdate({ keywords: toggle(filters.keywords, keyword) })}
				/>
			</div>

			<!-- Row 2 — numeric and scoping -->
			<div class="flex flex-wrap items-start gap-x-6 gap-y-3">
				<RangeControl
					legend="Cost"
					domain={dataset.domains.cost}
					value={filters.cost}
					onChange={(cost) => onUpdate({ cost })}
				/>
				<RangeControl
					legend="Power"
					domain={dataset.domains.power}
					value={filters.power}
					onChange={(power) => onUpdate({ power })}
				/>
				<RangeControl
					legend="RAM"
					domain={dataset.domains.ram}
					value={filters.ram}
					onChange={(ram) => onUpdate({ ram })}
				/>

				<fieldset>
					<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
						Eddiable
					</legend>
					<div class="inline-flex overflow-hidden rounded-md border border-edge text-sm">
						{#each eddiableOptions as option (option.label)}
							<button
								type="button"
								aria-pressed={filters.eddiable === option.value}
								onclick={() => onUpdate({ eddiable: option.value })}
								class="px-2.5 py-1 transition-colors {filters.eddiable === option.value
									? 'bg-neon text-void'
									: 'text-body hover:bg-raised'}">{option.label}</button
							>
						{/each}
					</div>
				</fieldset>

				<LegendSlots
					colorOrder={dataset.colorOrder}
					legendColors={filters.legendColors}
					{budget}
					onChange={(legendColors) => onUpdate({ legendColors })}
				/>

				<fieldset>
					<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
						Density
					</legend>
					<div
						class="inline-flex items-center overflow-hidden rounded-md border border-edge text-sm"
					>
						<button
							type="button"
							onclick={() => onColumns(columns - columnStep)}
							disabled={columns <= columnRange.min}
							aria-label="Fewer, larger cards"
							class="px-2.5 py-1 text-body hover:bg-raised disabled:opacity-30">−</button
						>
						<span class="w-10 text-center text-xs text-muted tabular-nums">{columns}</span>
						<button
							type="button"
							onclick={() => onColumns(columns + columnStep)}
							disabled={columns >= columnRange.max}
							aria-label="More, smaller cards"
							class="px-2.5 py-1 text-body hover:bg-raised disabled:opacity-30">+</button
						>
					</div>
				</fieldset>

				<fieldset>
					<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Sort</legend
					>
					<div class="flex flex-wrap gap-1.5">
						{#each SORT_KEYS as key (key)}
							{@const on = filters.sort.key === key}
							<button
								type="button"
								aria-pressed={on}
								onclick={() => setSort(key)}
								class="rounded-full border px-3 py-1 text-sm transition-colors {on
									? 'border-neon bg-neon text-void'
									: 'border-edge text-body hover:border-muted'}"
							>
								{SORT_LABELS[key]}{#if on && key !== 'default'}<span class="ml-1" aria-hidden="true"
										>{filters.sort.direction === 'asc' ? '↑' : '↓'}</span
									>{/if}
							</button>
						{/each}
					</div>
				</fieldset>
			</div>

			<!-- Disclosure -->
			<div>
				<button
					type="button"
					onclick={() => (showMore = !showMore)}
					aria-expanded={showMore}
					class="text-xs tracking-wide text-muted uppercase transition-colors hover:text-body"
				>
					{showMore ? '− Fewer filters' : '+ More filters'}
				</button>

				{#if showMore}
					<div class="mt-3 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						<TagList
							options={dataset.classifications}
							selected={filters.classifications}
							onToggle={(value) =>
								onUpdate({ classifications: toggle(filters.classifications, value) })}
						/>
						<div>
							<ChipGroup
								legend="Rarity"
								options={rarityOptions}
								selected={filters.rarities}
								onToggle={(rarity: Rarity) =>
									onUpdate({ rarities: toggle(filters.rarities, rarity) })}
							/>
							<p class="mt-2 text-[0.7rem] leading-snug text-muted/80">
								Nine rarities, read off every printing — three of them appear only on non-default
								printings, so filtering to them swaps the art a card shows.
							</p>
						</div>
						<SetList
							sets={dataset.sets}
							selected={filters.setIds}
							{setExclusiveCount}
							onToggle={(setId) => onUpdate({ setIds: toggle(filters.setIds, setId) })}
						/>
					</div>

					<!--
					A pull tab to close the section from its own bottom edge. The disclosure is tall
					enough that the toggle which opened it can be scrolled well out of view, and hunting
					back up for it to close it again is the kind of small friction that makes a panel feel
					like it traps you.
				-->
					<button
						type="button"
						onclick={() => (showMore = false)}
						aria-label="Collapse the additional filters"
						class="mx-auto mt-3 flex h-5 w-16 items-center justify-center
						rounded-b-lg border border-t-0 border-edge bg-shell text-muted transition-colors hover:border-neon
						hover:text-neon"
					>
						<span aria-hidden="true" class="text-xs leading-none">▲</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
