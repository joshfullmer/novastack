<script lang="ts">
	/**
	 * The full-art popup shown when hovering a compact row or slot elsewhere on the page — a deck
	 * list row, a Legend slot. Positioned to the *left* of the hovered element rather than a
	 * hardcoded viewport offset, so it works regardless of which panel width hosts it.
	 *
	 * Shows the Printing the deck chose for the card when the caller says which (`printingId`), and the
	 * Default Printing otherwise — a deck row previewing art the deck does not use would be showing a
	 * different deck.
	 */
	import type { Card } from '#lib/cards/schema.js';
	import { deckPrinting } from '#lib/decks/printing.js';
	import CardImage from './CardImage.svelte';

	const PREVIEW_WIDTH = 224;
	const GAP = 12;
	/** 733:1024 across every mirrored image (`CardImage`), so the rendered height is known before
	 * paint — which is what lets the clamp below avoid measuring, and so avoid a visible jump. */
	const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * 1024) / 733);

	let {
		hovered
	}: { hovered: { card: Card; printingId?: string; left: number; top: number } | null } = $props();

	/**
	 * Aligned to the hovered row's top *where it fits*, and pushed up to sit on the bottom edge
	 * where it doesn't.
	 *
	 * Without this the preview ran off the bottom of the viewport for anything in the lower ~300px
	 * of a panel — which on the deckbuilder screen is every one of the sideboard's tiles, since
	 * that section is pinned to the bottom of the deck panel by design.
	 *
	 * Reads `innerHeight` per hover rather than tracking resizes: the preview only exists while a
	 * pointer is on a card, and a viewport that changes size mid-hover re-fires hover anyway.
	 */
	const top = $derived.by(() => {
		// `typeof window` because a hover position can only exist client-side, but this component
		// is rendered (with `hovered` null) during SSR too.
		if (!hovered || typeof window === 'undefined') return hovered?.top ?? 0;
		const lowest = window.innerHeight - PREVIEW_HEIGHT - GAP;
		return Math.max(GAP, Math.min(hovered.top, lowest));
	});
</script>

{#if hovered}
	{@const printing = deckPrinting(hovered.card, hovered.printingId)}
	<div
		class="pointer-events-none fixed z-30 w-56"
		style="left: {Math.max(GAP, hovered.left - PREVIEW_WIDTH - GAP)}px; top: {top}px;"
	>
		<CardImage
			printingId={printing.id}
			thumbhash={printing.thumbhash}
			color={hovered.card.color}
			alt={hovered.card.name}
			sizes="224px"
			class="rounded-lg shadow-2xl shadow-void"
		/>
	</div>
{/if}
