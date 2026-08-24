<script lang="ts">
	/**
	 * The header band over the grid.
	 *
	 * **The query box is the primary input** (spec §9) — a single text field editing the raw
	 * `?q=` source directly, replacing stage 1's plain substring search box. The whole chip
	 * panel below it collapses behind one toggle; **density stays always visible**, the one
	 * exception spec §9 names, so it lives outside the collapsible area alongside the query box.
	 *
	 * Each chip control mirrors one facet of `ChipView` (`#lib/filters/chips.js`). A facet that
	 * comes back `interactive: false` — because the query used `or`/`not` in a way no chip can
	 * reflect, or a value no control can produce — renders as an inert notice instead of the
	 * live control, never silently hidden (spec §9's observability requirement).
	 */
	import type { Dataset } from '#lib/cards/dataset.js';
	import {
		KEYWORDS,
		type CardType,
		type Color,
		type Keyword,
		type Rarity
	} from '#lib/cards/vocabulary.js';
	import type { ChipView } from '#lib/filters/chips.js';
	import type { ColorBudget } from '#lib/filters/budget.js';
	import type { FacetEdit } from '#lib/filters/query-edit.js';
	import type { ParseWarning } from '#lib/query/index.js';
	import { SORT_KEYS, SORT_LABELS, type Sort, type SortKey } from '#lib/filters/sort.js';
	import { slide } from 'svelte/transition';
	import { COLOR_CHIP_OFF, COLOR_CHIP_ON } from '../color.js';
	import ChipGroup from './ChipGroup.svelte';
	import LegendSlots from './LegendSlots.svelte';
	import RangeControl from './RangeControl.svelte';
	import SetList from './SetList.svelte';
	import TagList from './TagList.svelte';

	let {
		dataset,
		source,
		view,
		warnings,
		budget,
		sort,
		setExclusiveCount,
		filtered,
		onSource,
		onFacetEdit,
		onSort,
		onClear,
		height = $bindable(0)
	}: {
		dataset: Dataset;
		source: string;
		view: ChipView;
		warnings: readonly ParseWarning[];
		budget: ColorBudget;
		sort: Sort;
		setExclusiveCount: number;
		filtered: boolean;
		onSource: (next: string) => void;
		onFacetEdit: (edit: FacetEdit) => void;
		onSort: (sort: Sort) => void;
		onClear: () => void;
		height?: number;
	} = $props();

	let showMore = $state(false);
	let queryEl = $state<HTMLInputElement>();

	/** The box holds its own text while focused, same reasoning as stage 1's search box: a
	 * debounced URL push landing mid-keystroke must never overwrite what's being typed. */
	let queryText = $state('');

	$effect(() => {
		if (queryEl !== document.activeElement) queryText = source;
	});

	/** Below the breakpoint the whole panel collapses behind one button — now the *entire*
	 * chip panel, not just "More filters" (spec §9), since the query box already covers
	 * everything the chips can and can't express. */
	let showFilters = $state(false);

	/** How many facets are currently engaged, regardless of read-only/interactive — the query
	 * text already shows *what*; this is just "how much" for the collapsed button. */
	const activeFacetCount = $derived(
		[
			view.colors,
			view.cardTypes,
			view.keywords,
			view.tags,
			view.rarities,
			view.setIds,
			view.legendColors
		].filter((facet) => facet.interactive && facet.value.length > 0).length +
			[view.cost, view.power, view.ram].filter(
				(facet) =>
					facet.interactive &&
					(facet.value.min !== null || facet.value.max !== null || !facet.value.includeNull)
			).length +
			(view.eddiable.interactive && view.eddiable.value !== null ? 1 : 0)
	);

	function setSort(key: SortKey) {
		const direction: Sort['direction'] =
			sort.key === key && key !== 'default' && sort.direction === 'asc' ? 'desc' : 'asc';
		onSort({ key, direction });
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

	function toggle<T>(values: readonly T[], value: T): T[] {
		return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
	}
</script>

{#snippet readOnlyNotice(label: string)}
	<p
		class="rounded-md border border-dashed border-edge/70 px-2.5 py-1 text-xs text-muted/80 italic"
	>
		{label} — set by the query text, not editable here
	</p>
{/snippet}

<div
	bind:clientHeight={height}
	class="sticky top-nav z-20 border-b border-edge/60 bg-shell/85 backdrop-blur-md"
>
	<div class="mx-auto max-w-[1800px] space-y-3 px-4 py-3 sm:px-6">
		<!-- The query box: the primary input, always visible. -->
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={() => (showFilters = !showFilters)}
				aria-expanded={showFilters}
				class="flex shrink-0 items-center gap-1.5 rounded-lg border border-edge
					px-3 py-2 text-sm text-body transition-colors hover:border-neon"
			>
				<span aria-hidden="true">{showFilters ? '−' : '+'}</span>
				<span
					>Filters{#if activeFacetCount > 0}<span class="text-neon">
							· {activeFacetCount}</span
						>{/if}</span
				>
			</button>

			<div class="relative flex-1">
				<label for="grid-query" class="sr-only">Search or filter with a query</label>
				<input
					id="grid-query"
					bind:this={queryEl}
					value={queryText}
					oninput={(event) => {
						queryText = event.currentTarget.value;
						onSource(queryText);
					}}
					type="search"
					placeholder="Search, or write a query — try t:legend c:red"
					autocomplete="off"
					class="w-full rounded-lg border border-edge bg-void px-4
						py-2.5 text-bright transition-colors outline-none placeholder:text-muted focus:border-neon"
				/>
			</div>

			<a
				href="/syntax"
				class="hidden shrink-0 text-sm text-muted underline decoration-dotted underline-offset-4
					transition-colors hover:text-neon sm:inline"
			>
				Syntax
			</a>

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

		{#if warnings.length > 0}
			<div
				role="status"
				class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
			>
				{warnings.length === 1
					? 'One part of this query was ignored'
					: `${warnings.length} parts of this query were ignored`}
				— results are wider than what was typed.
			</div>
		{/if}

		{#if showFilters}
			<div class="space-y-3" transition:slide={{ duration: 200 }}>
				<!-- Row 1 — categorical -->
				<div class="flex flex-wrap gap-x-6 gap-y-3">
					{#if view.colors.interactive}
						<ChipGroup
							legend="Color"
							options={colorOptions}
							selected={view.colors.value}
							tintOn={COLOR_CHIP_ON}
							tintOff={COLOR_CHIP_OFF}
							onToggle={(color: Color) =>
								onFacetEdit({
									facet: 'color',
									values: toggle(view.colors.interactive ? view.colors.value : [], color)
								})}
						/>
					{:else}
						{@render readOnlyNotice('Color')}
					{/if}

					{#if view.cardTypes.interactive}
						<ChipGroup
							legend="Type"
							options={typeOptions}
							selected={view.cardTypes.value}
							onToggle={(cardType: CardType) =>
								onFacetEdit({
									facet: 'cardType',
									values: toggle(view.cardTypes.interactive ? view.cardTypes.value : [], cardType)
								})}
						/>
					{:else}
						{@render readOnlyNotice('Type')}
					{/if}

					{#if view.keywords.interactive}
						<ChipGroup
							legend="Keywords"
							options={keywordOptions}
							selected={view.keywords.value}
							onToggle={(keyword: Keyword) =>
								onFacetEdit({
									facet: 'keyword',
									values: toggle(view.keywords.interactive ? view.keywords.value : [], keyword)
								})}
						/>
					{:else}
						{@render readOnlyNotice('Keywords')}
					{/if}
				</div>

				<!-- Row 2 — numeric and scoping -->
				<div class="flex flex-wrap items-start gap-x-6 gap-y-3">
					{#if view.cost.interactive}
						<RangeControl
							legend="Cost"
							domain={dataset.domains.cost}
							value={view.cost.value}
							onChange={(cost) => onFacetEdit({ facet: 'cost', range: cost })}
						/>
					{:else}
						{@render readOnlyNotice('Cost')}
					{/if}

					{#if view.power.interactive}
						<RangeControl
							legend="Power"
							domain={dataset.domains.power}
							value={view.power.value}
							onChange={(power) => onFacetEdit({ facet: 'power', range: power })}
						/>
					{:else}
						{@render readOnlyNotice('Power')}
					{/if}

					{#if view.ram.interactive}
						<RangeControl
							legend="RAM"
							domain={dataset.domains.ram}
							value={view.ram.value}
							onChange={(ram) => onFacetEdit({ facet: 'ram', range: ram })}
						/>
					{:else}
						{@render readOnlyNotice('RAM')}
					{/if}

					{#if view.eddiable.interactive}
						{@const eddiableOptions = [
							{ value: null, label: 'Any' },
							{ value: true, label: 'Yes' },
							{ value: false, label: 'No' }
						] as const}
						<fieldset>
							<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
								Eddiable
							</legend>
							<div class="inline-flex overflow-hidden rounded-md border border-edge text-sm">
								{#each eddiableOptions as option (option.label)}
									<button
										type="button"
										aria-pressed={view.eddiable.interactive && view.eddiable.value === option.value}
										onclick={() => onFacetEdit({ facet: 'eddiable', value: option.value })}
										class="px-2.5 py-1 transition-colors {view.eddiable.interactive &&
										view.eddiable.value === option.value
											? 'bg-neon text-void'
											: 'text-body hover:bg-raised'}">{option.label}</button
									>
								{/each}
							</div>
						</fieldset>
					{:else}
						{@render readOnlyNotice('Eddiable')}
					{/if}

					{#if view.legendColors.interactive}
						<LegendSlots
							colorOrder={dataset.colorOrder}
							legendColors={view.legendColors.value}
							{budget}
							onChange={(legendColors) => onFacetEdit({ facet: 'legends', colors: legendColors })}
						/>
					{:else}
						{@render readOnlyNotice('Legend colors')}
					{/if}

					<fieldset>
						<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase"
							>Sort</legend
						>
						<div class="flex flex-wrap gap-1.5">
							{#each SORT_KEYS as key (key)}
								{@const on = sort.key === key}
								<button
									type="button"
									aria-pressed={on}
									onclick={() => setSort(key)}
									class="rounded-full border px-3 py-1 text-sm transition-colors {on
										? 'border-neon bg-neon text-void'
										: 'border-edge text-body hover:border-muted'}"
								>
									{SORT_LABELS[key]}{#if on && key !== 'default'}<span
											class="ml-1"
											aria-hidden="true">{sort.direction === 'asc' ? '↑' : '↓'}</span
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
						<div transition:slide={{ duration: 200 }}>
							<div class="mt-3 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
								{#if view.tags.interactive}
									<TagList
										options={dataset.classifications}
										selected={view.tags.value}
										onToggle={(value) =>
											onFacetEdit({
												facet: 'tag',
												values: toggle(view.tags.interactive ? view.tags.value : [], value)
											})}
									/>
								{:else}
									{@render readOnlyNotice('Tags')}
								{/if}

								<div>
									{#if view.rarities.interactive}
										<ChipGroup
											legend="Rarity"
											options={rarityOptions}
											selected={view.rarities.value}
											onToggle={(rarity: Rarity) =>
												onFacetEdit({
													facet: 'rarity',
													values: toggle(
														view.rarities.interactive ? view.rarities.value : [],
														rarity
													)
												})}
										/>
									{:else}
										{@render readOnlyNotice('Rarity')}
									{/if}
									<p class="mt-2 text-[0.7rem] leading-snug text-muted/80">
										Nine rarities, read off every printing — three of them appear only on
										non-default printings, so filtering to them swaps the art a card shows.
									</p>
								</div>

								{#if view.setIds.interactive}
									<SetList
										sets={dataset.sets}
										selected={view.setIds.value}
										{setExclusiveCount}
										onToggle={(setId) =>
											onFacetEdit({
												facet: 'set',
												values: toggle(view.setIds.interactive ? view.setIds.value : [], setId)
											})}
									/>
								{:else}
									{@render readOnlyNotice('Sets')}
								{/if}
							</div>

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
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
