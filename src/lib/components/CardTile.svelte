<script lang="ts">
	/**
	 * **Tiles are pure art — no caption.**
	 *
	 * With a density control and a detail pane, a caption is redundant: the grid's job is
	 * *recognition*, the pane's job is *reading*. The only tile text is a collector-number badge,
	 * and only when the art shown is a non-default printing — which happens constantly under a
	 * Set filter, because every retail set has a beta twin.
	 *
	 * The tile is a real `<a href>` even on desktop, where the click is intercepted to select
	 * into the pane instead. That is what gives keyboard focus, middle-click, "open in new tab"
	 * and the mobile behaviour for free — and it is what makes the detail route the natural
	 * fallback rather than a special case.
	 */
	import { resolve } from '$app/paths';
	import type { Card, Printing } from '#lib/cards/schema.js';
	import CardImage from './CardImage.svelte';

	let {
		card,
		printing,
		selected = false,
		sizes,
		eager = false,
		onSelect
	}: {
		card: Card;
		printing: Printing;
		selected?: boolean;
		sizes: string;
		eager?: boolean;
		/**
		 * Return `true` to keep the click local (select into the pane); `false` lets the link
		 * navigate. The caller decides — a phone has no pane, and a second click on an
		 * already-selected tile means "open the whole card".
		 */
		onSelect: () => boolean;
	} = $props();

	const isDefaultPrinting = $derived(printing.id === card.printings[0].id);
</script>

<a
	href={resolve('/cards/[slug]', { slug: card.slug })}
	onclick={(event) => {
		// Never swallow a modified click: those mean "new tab", not "select".
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		if (onSelect()) event.preventDefault();
	}}
	aria-current={selected ? 'true' : undefined}
	class="group relative block overflow-hidden rounded-lg transition-transform duration-150
		hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2
		focus-visible:outline-neon"
	class:ring-2={selected}
	class:ring-neon={selected}
>
	<CardImage
		printingId={printing.id}
		thumbhash={printing.thumbhash}
		color={card.color}
		alt={card.name}
		{sizes}
		{eager}
		class="rounded-lg"
	/>

	{#if !isDefaultPrinting}
		<span
			class="absolute right-1 bottom-1 rounded bg-void/85 px-1.5 py-0.5 font-mono text-[0.65rem]
				text-bright tabular-nums backdrop-blur-sm"
		>
			{printing.collectorNumber}
		</span>
	{/if}
</a>
