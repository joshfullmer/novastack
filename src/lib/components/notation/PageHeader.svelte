<script lang="ts">
	/**
	 * The title block every Notation page opens with, so that the four of them cannot drift into four
	 * different headings: one `<h1>`, at one size, and an optional lead sentence under it.
	 *
	 * The section's name is not repeated here — the tab row (`SectionNav`) carries "Nova Notation" on
	 * every page. The lead is inline content only: it is wrapped in a `<p>`.
	 */
	import type { Snippet } from 'svelte';

	let {
		title,
		children,
		class: className = ''
	}: { title: string; children?: Snippet; class?: string } = $props();
</script>

<header class="space-y-2 {className}">
	<h1 class="text-3xl font-semibold tracking-tight text-bright">{title}</h1>
	{#if children}
		<p class="max-w-2xl leading-relaxed text-body">{@render children()}</p>
	{/if}
</header>
