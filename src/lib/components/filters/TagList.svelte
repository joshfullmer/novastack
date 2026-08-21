<script lang="ts">
	/**
	 * Classifications — **a searchable list, not chips**.
	 *
	 * 39 values with a long tail (Ganger 25, Merc 23, … eight singletons) and a mean of 1.73 per
	 * card. Thirty-nine chips is a wall; a filter box over a scrolling list finds `Voodoo Boys` in
	 * three keystrokes. Counts are shown because the tail is where the surprise lives.
	 *
	 * Ordered commonest-first, which is how the dataset actually reads — alphabetical would bury
	 * the four values that cover a third of the cards.
	 */
	import type { FacetCount } from '#lib/cards/dataset.js';
	import { normalizeForSearch } from '#lib/cards/dataset.js';

	let {
		options,
		selected,
		onToggle
	}: {
		options: readonly FacetCount[];
		selected: readonly string[];
		onToggle: (value: string) => void;
	} = $props();

	let filter = $state('');

	const visible = $derived.by(() => {
		const needle = normalizeForSearch(filter);
		if (needle === '') return options;
		return options.filter((option) => normalizeForSearch(option.value).includes(needle));
	});
</script>

<fieldset class="min-w-0">
	<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
		Tags
		{#if selected.length > 0}
			<span class="text-neon">({selected.length})</span>
		{/if}
	</legend>

	<label for="tag-filter" class="sr-only">Filter tags</label>
	<input
		id="tag-filter"
		bind:value={filter}
		type="search"
		placeholder="Filter {options.length} tags…"
		autocomplete="off"
		class="mb-1.5 w-full rounded-md border border-edge bg-void px-2
			py-1 text-sm text-body outline-none placeholder:text-muted focus:border-neon"
	/>

	<ul class="max-h-48 overflow-y-auto rounded-md border border-edge/50">
		{#each visible as option (option.value)}
			<li>
				<label class="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-raised/60">
					<input
						type="checkbox"
						checked={selected.includes(option.value)}
						onchange={() => onToggle(option.value)}
						class="size-3.5 accent-neon"
					/>
					<span class="flex-1 truncate">{option.value}</span>
					<span class="text-xs text-muted tabular-nums">{option.count}</span>
				</label>
			</li>
		{:else}
			<li class="px-2 py-2 text-sm text-muted">No tag matches “{filter}”.</li>
		{/each}
	</ul>
</fieldset>
