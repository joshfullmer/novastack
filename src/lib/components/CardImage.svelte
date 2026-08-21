<script lang="ts">
	/**
	 * A mirrored card image with a three-stage placeholder.
	 *
	 * ```
	 * card Color (zero bytes, paints instantly)
	 *   → ThumbHash (~25 bytes, inline in the snapshot, on hydration)
	 *     → the real image, cross-faded on load
	 * ```
	 *
	 * ThumbHash rather than BlurHash because every card image has an alpha channel for its
	 * rounded corners, and BlurHash cannot encode alpha — it would bleed an opaque rectangle
	 * past the card silhouette on every tile.
	 *
	 * Two details that are easy to get wrong and very visible:
	 *
	 * - **The cached-image trap.** If the image is already cached, `load` fires before Svelte
	 *   attaches the handler, and the blur never clears. The `img.complete` check in an effect
	 *   is the fix, and this is the most common blur-up defect in the wild.
	 * - **`scale-105` on the placeholder.** Blurring samples past the element edge and leaves a
	 *   faded border; scaling up pushes that artifact outside the box.
	 *
	 * The aspect ratio is a hard 733:1024 across all 389 images, so it is hardcoded and there is
	 * zero layout shift.
	 */
	import { thumbHashToDataURL } from 'thumbhash';
	import { cardImageSrcset, cardImageUrl } from '#lib/cards/schema.js';
	import type { Color } from '#lib/cards/vocabulary.js';
	import { COLOR_TINT } from './color.js';

	let {
		printingId,
		thumbhash,
		color,
		alt,
		sizes = '244px',
		/** The first grid row must be eager, or immediately-visible tiles flash their blur. */
		eager = false,
		class: className = ''
	}: {
		printingId: string;
		thumbhash: string;
		color: Color;
		alt: string;
		sizes?: string;
		eager?: boolean;
		class?: string;
	} = $props();

	let img = $state<HTMLImageElement>();

	const placeholder = $derived(
		thumbHashToDataURL(Uint8Array.from(atob(thumbhash), (character) => character.charCodeAt(0)))
	);

	const src = $derived(cardImageUrl(printingId, 488));

	/**
	 * A **writable** `$derived`: it computes the answer, and `onload` overrides it.
	 *
	 * That covers two failure modes in one expression. A **cached** image finishes before
	 * hydration, so `load` never fires and the blur would stick forever — `img.complete` is the
	 * fix, and this is the most common blur-up defect in the wild. A **changed** printing (the
	 * detail page's chooser, or a tile swapping art under a Set filter) has to reset to false, or
	 * the previous art stays visible under the new `src`; because this is derived from `src`, the
	 * override is discarded automatically when the printing changes.
	 *
	 * Comparing against `src` rather than just reading `complete` is what distinguishes "this
	 * image is ready" from "some earlier image was ready".
	 */
	let loaded = $derived(img?.complete === true && img.src.endsWith(src));
</script>

<div class="relative card-frame overflow-hidden {COLOR_TINT[color]} {className}">
	<img
		src={placeholder}
		alt=""
		aria-hidden="true"
		class="absolute inset-0 size-full scale-105 blur-md transition-opacity duration-300"
		class:opacity-0={loaded}
	/>
	<img
		bind:this={img}
		{src}
		srcset={cardImageSrcset(printingId)}
		{sizes}
		{alt}
		width="733"
		height="1024"
		loading={eager ? 'eager' : 'lazy'}
		fetchpriority={eager ? 'high' : 'auto'}
		decoding="async"
		onload={() => (loaded = true)}
		class="relative size-full transition-opacity duration-500"
		class:opacity-0={!loaded}
	/>
</div>
