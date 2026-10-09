<script lang="ts">
	/**
	 * One group of related settings: a titled card whose children are `SettingRow`s.
	 *
	 * Every panel on a settings page is visible at once and reached by anchor link, so it carries its
	 * own `id` and a scroll margin that clears the sticky header. `tone="danger"` is for the one panel
	 * that deletes things, and is the only place red is used for a heading.
	 */
	import type { Snippet } from 'svelte';

	let {
		id,
		title,
		description,
		tone = 'default',
		children
	}: {
		id: string;
		title: string;
		description?: string;
		tone?: 'default' | 'danger';
		children: Snippet;
	} = $props();

	const danger = $derived(tone === 'danger');
</script>

<section
	{id}
	aria-labelledby="{id}-title"
	class="scroll-mt-[calc(var(--spacing-nav)+1rem)] rounded-xl border bg-shell
		{danger ? 'border-card-red/40' : 'border-edge'}"
>
	<header class="border-b px-5 py-4 sm:px-6 {danger ? 'border-card-red/30' : 'border-edge/60'}">
		<h2 id="{id}-title" class="text-base font-semibold {danger ? 'text-card-red' : 'text-bright'}">
			{title}
		</h2>
		{#if description}
			<p class="mt-0.5 text-sm text-muted">{description}</p>
		{/if}
	</header>

	<div class="divide-y divide-edge/60 px-5 sm:px-6">
		{@render children()}
	</div>
</section>
