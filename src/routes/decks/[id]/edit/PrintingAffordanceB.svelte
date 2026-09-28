<script lang="ts">
	/**
	 * PROTOTYPE — DELETE ME. Variant B: **selection drives a docked pane**.
	 *
	 * The affordance is just a selection marker — no overlay, nothing opens on top of the deck.
	 * Clicking it selects the entry; `PrintingPaneB.svelte` (mounted once, page level) shows that
	 * card's printings as a vertical strip you can work down. Bet: for a deck where you want to
	 * reprint a dozen cards, keeping one pane open beats opening and closing twelve popovers.
	 */
	import { setLabel } from '#lib/collection/printing-search.js';
	import type { Card } from '#lib/cards/schema.js';
	import { printingPrototype as proto } from './printing-prototype.svelte.js';

	let { card }: { card: Card } = $props();

	const current = $derived(proto.printingFor(card));
	const selected = $derived(proto.selectedSlug === card.slug);
</script>

<button
	type="button"
	onclick={() => proto.select(selected ? null : card.slug)}
	aria-pressed={selected}
	class="flex shrink-0 items-center gap-1 rounded border px-1 font-mono text-[0.6rem] tabular-nums
		transition-colors"
	class:border-neon={selected}
	class:bg-neon={selected}
	class:text-void={selected}
	class:border-edge={!selected}
	class:text-muted={!selected}
	class:hover:border-neon-dim={!selected}
	class:hover:text-neon={!selected}
	title="{setLabel(current.setId)} #{current.collectorNumber}"
>
	<span>{current.collectorNumber}</span>
	{#if !proto.isDefault(card)}<span class="text-[0.5rem]">◈</span>{/if}
</button>
