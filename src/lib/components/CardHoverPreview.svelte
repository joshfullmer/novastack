<script lang="ts">
	/**
	 * The full-art popup shown when hovering a compact row or slot elsewhere on the page — a deck
	 * list row, a Legend slot. Positioned to the *left* of the hovered element rather than a
	 * hardcoded viewport offset, so it works regardless of which panel width hosts it.
	 */
	import type { Card } from '#lib/cards/schema.js';
	import CardImage from './CardImage.svelte';

	const PREVIEW_WIDTH = 224;
	const GAP = 12;

	let { hovered }: { hovered: { card: Card; left: number; top: number } | null } = $props();
</script>

{#if hovered}
	<div
		class="pointer-events-none fixed z-30 w-56"
		style="left: {Math.max(GAP, hovered.left - PREVIEW_WIDTH - GAP)}px; top: {hovered.top}px;"
	>
		<CardImage
			printingId={hovered.card.printings[0].id}
			thumbhash={hovered.card.printings[0].thumbhash}
			color={hovered.card.color}
			alt={hovered.card.name}
			sizes="224px"
			class="rounded-lg shadow-2xl shadow-void"
		/>
	</div>
{/if}
