<script lang="ts">
	// The List / Gallery switch every cards view in the app shares. `first` is which sits on the left: a
	// deck leads with its art, a list of events with its rows.
	let {
		value,
		onchange,
		first = 'list'
	}: {
		value: 'list' | 'gallery';
		onchange: (next: 'list' | 'gallery') => void;
		first?: 'list' | 'gallery';
	} = $props();

	const views = $derived(
		first === 'list' ? (['list', 'gallery'] as const) : (['gallery', 'list'] as const)
	);
	const LABEL = { list: 'List', gallery: 'Gallery' };
</script>

<div class="flex overflow-hidden rounded-md border border-edge text-xs">
	{#each views as view (view)}
		<button
			type="button"
			onclick={() => onchange(view)}
			class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
			class:bg-raised={value === view}
			class:text-bright={value === view}
			class:text-muted={value !== view}>{LABEL[view]}</button
		>
	{/each}
</div>
