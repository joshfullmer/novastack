<script lang="ts" generics="T extends string">
	// The view switch every cards view in the app shares (List / Gallery, and Stacks for a deck). The
	// options sit in the order given: a deck leads with its art, a list of events with its rows.
	let {
		value,
		options,
		onchange
	}: {
		value: T;
		options: readonly T[];
		onchange: (next: T) => void;
	} = $props();

	const LABEL: Record<string, string> = { list: 'List', gallery: 'Gallery', stacks: 'Stacks' };
</script>

<div class="flex overflow-hidden rounded-md border border-edge text-xs">
	{#each options as option (option)}
		<button
			type="button"
			onclick={() => onchange(option)}
			class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
			class:bg-raised={value === option}
			class:text-bright={value === option}
			class:text-muted={value !== option}>{LABEL[option] ?? option}</button
		>
	{/each}
</div>
