<script lang="ts">
	/**
	 * One setting: what it is and what it does on the left, the control on the right. They stack on a
	 * phone. The row is also an anchor target (`id`) so a sentence elsewhere can link straight to it,
	 * and names its own title and description (`{id}-label`, `{id}-description`) for a control inside
	 * it to point `aria-labelledby` / `aria-describedby` at.
	 *
	 * `align="end"` is for a control that is a fixed small thing (a switch), which sits at the right
	 * edge; the default lets a form fill the control column.
	 */
	import type { Snippet } from 'svelte';

	let {
		id,
		title,
		description,
		align = 'start',
		children
	}: {
		id: string;
		title: string;
		description?: string;
		align?: 'start' | 'end';
		children: Snippet;
	} = $props();
</script>

<div
	{id}
	class="flex scroll-mt-[calc(var(--spacing-nav)+1rem)] flex-col gap-3 py-5
		md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-8"
>
	<div class="min-w-0">
		<h3 id="{id}-label" class="text-sm font-medium text-body">{title}</h3>
		{#if description}
			<p id="{id}-description" class="mt-0.5 text-sm text-muted">{description}</p>
		{/if}
	</div>
	<div class="min-w-0 {align === 'end' ? 'flex items-start md:justify-end' : ''}">
		{@render children()}
	</div>
</div>
