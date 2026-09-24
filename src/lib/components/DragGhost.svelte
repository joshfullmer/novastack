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

	let {
		drag,
		/**
		 * The `sizes` the **destination** uses, not the ghost's own width.
		 *
		 * Deliberate over-request. `srcset` candidates are chosen from `sizes`, so a card dragged
		 * out of the search panel (thumbnails at ~110px) used to land in a Pocket that wanted a much
		 * larger candidate — a cache miss, which meant the freshly rendered Pocket fell back to its
		 * ThumbHash and blurred up again right where the card had just landed. Asking for the
		 * Pocket's resolution here means the bytes arrive while the card is still in the air, and
		 * `CardImage`'s `img.complete` check then shows it with no placeholder at all.
		 */
		sizes
	}: { drag: PocketDrag; sizes: string } = $props();

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
		<!--
			The ring goes the moment the card is released.

			It marks "this is in your hand", so it has no job once the card is landing — and it looked
			wrong doing it: a ring is drawn *outside* the border radius, and the ghost lands by
			scaling, so both its width and its corner radius scale with it. A card dragged out of the
			search panel more than doubles in size on the way down, which stretched a 2px ring into a
			thick band whose curve no longer matched the Pocket it was settling into. Faded rather than
			cut, so its disappearance isn't a second event competing with the landing.
		-->
		<CardImage
			printingId={row.printing.id}
			thumbhash={row.printing.thumbhash}
			color={row.card.color}
			alt=""
			{sizes}
			eager
			class="rounded-2xl shadow-2xl shadow-void transition-shadow duration-150
				{drag.landing ? '' : 'ring-2 ring-neon/50'}"
		/>
	</div>
{/if}
