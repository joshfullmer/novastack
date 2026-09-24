<script lang="ts">
	/**
	 * The card in the air during a Pocket drag.
	 *
	 * Portaled to `<body>` and `position: fixed`, because it has to sit above everything and follow
	 * the viewport rather than the page: a `filter` or `backdrop-filter` anywhere in its ancestry
	 * would otherwise become its containing block and quietly break every coordinate `PocketDrag`
	 * computes.
	 *
	 * `pointer-events: none` is load-bearing, not cosmetic — hit-testing is
	 * `document.elementFromPoint` at the cursor, and the card is directly under the cursor. Take
	 * this off and the only thing it can ever find is the ghost itself.
	 *
	 * Positioned with `translate3d`, never `left`/`top`: a transform is composited, so the ghost
	 * moves without laying the page out again 120 times a second. `transform-origin` stays at the
	 * centre — `PocketDrag`'s landing maths depends on scaling not moving the centre.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { portal } from '#lib/components/filters/portal.js';
	import { draggedRow, type PocketDrag } from '#lib/collection/pocket-drag.svelte.js';

	let { drag }: { drag: PocketDrag } = $props();

	const row = $derived(draggedRow(drag));
</script>

{#if row}
	<div
		use:portal
		aria-hidden="true"
		class="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
		style="width: {drag.width}px; opacity: {drag.opacity}; transform: translate3d({drag.x}px, {drag.y}px, 0)
			rotate({drag.rotation}deg) scale({drag.scale});"
	>
		<CardImage
			printingId={row.printing.id}
			thumbhash={row.printing.thumbhash}
			color={row.card.color}
			alt=""
			sizes="260px"
			eager
			class="rounded-lg shadow-2xl ring-2 shadow-void ring-neon/50"
		/>
	</div>
{/if}
