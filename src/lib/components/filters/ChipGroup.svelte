<script lang="ts" generics="T extends string">
	/**
	 * A multi-select chip row. **OR within a facet** — selecting Red and Blue widens.
	 *
	 * Chips are real `<button aria-pressed>` elements, not styled checkboxes, because they are
	 * toggles rather than form fields and `aria-pressed` is what a screen reader announces as
	 * "pressed"/"not pressed". Every chip is labelled with text: colour is never the only carrier
	 * of meaning, so the Colour chips are tinted *and* named.
	 */
	let {
		legend,
		options,
		selected,
		onToggle,
		/** Optional tint classes, keyed by value — used by the Colour facet. */
		tintOn,
		tintOff
	}: {
		legend: string;
		options: readonly { value: T; label: string; count?: number }[];
		selected: readonly T[];
		onToggle: (value: T) => void;
		tintOn?: Record<string, string>;
		tintOff?: Record<string, string>;
	} = $props();

	const base = 'rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-neon';
</script>

<fieldset class="min-w-0">
	<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">{legend}</legend>
	<div class="flex flex-wrap gap-1.5">
		{#each options as option (option.value)}
			{@const on = selected.includes(option.value)}
			<button
				type="button"
				aria-pressed={on}
				onclick={() => onToggle(option.value)}
				class="{base} {on
					? (tintOn?.[option.value] ?? 'border-neon bg-neon text-void')
					: (tintOff?.[option.value] ?? 'border-edge text-body hover:border-muted')}"
			>
				{option.label}
				{#if option.count !== undefined}
					<span class="ml-1 text-[0.75em] tabular-nums opacity-60">{option.count}</span>
				{/if}
			</button>
		{/each}
	</div>
</fieldset>
