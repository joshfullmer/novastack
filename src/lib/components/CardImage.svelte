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

	/**
	 * Every Printing whose art has finished loading at least once this session, shared by every
	 * instance.
	 *
	 * A second `<img>` for the same Printing cannot avoid firing `load` asynchronously, so it would
	 * otherwise paint its ThumbHash for a frame or two before the real pixels arrive — a blink on a
	 * card that has been on screen for minutes. If we have loaded it once, the bytes are in the
	 * browser's cache and the real image is a frame away, so it starts visible and the blur stays
	 * behind it as a safety net rather than in front as a placeholder.
	 *
	 * Deliberately a plain `Set`, not `SvelteSet`: nothing reads it reactively. It is consulted once
	 * per render to decide how to paint, and a card appearing elsewhere on screen must not
	 * invalidate every other tile.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once per render, never tracked
	const loadedOnce = new Set<string>();

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
	 * A load that comes back this fast came from cache, so it should not be cross-faded.
	 *
	 * Generous on purpose: the point is to separate "already had these bytes" from "went to the
	 * network", and even a cache hit is asynchronous.
	 */
	const CACHED_MS = 150;

	/**
	 * Paint state for the current `src`, as a **writable** `$derived`: it computes the answer, and
	 * `onload` overrides it.
	 *
	 * `loaded` covers two failure modes in one expression. A **cached** image finishes before
	 * hydration, so `load` never fires and the blur would stick forever — `img.complete` is the
	 * fix, and this is the most common blur-up defect in the wild. A **changed** printing (the
	 * detail page's chooser, or a tile swapping art under a Set filter) has to reset to false, or
	 * the previous art stays visible under the new `src`; because this is derived from `src`, the
	 * override is discarded automatically when the printing changes. Comparing against `src` rather
	 * than just reading `complete` is what distinguishes "this image is ready" from "some earlier
	 * image was ready".
	 *
	 * `instant` exists because **a brand-new `<img>` element always fires `load` asynchronously,
	 * even when the bytes are already in memory** — so anything that re-renders a card into a fresh
	 * element made it blur up from its ThumbHash all over again. The binder's page turn does that
	 * twice per turn (the turning leaf carries its own copy of two Pages, then the half underneath
	 * re-renders), and the second fade was still running when the leaf lifted: a visible flash of a
	 * card that had been on screen a moment earlier. If the load resolves within `CACHED_MS` of the
	 * `src` first rendering, the image simply appears.
	 *
	 * `startedAt` is when that happened, and it resets with `src` for free, being part of the same
	 * derived value.
	 */
	let paint = $derived({
		loaded: img?.complete === true && img.src.endsWith(src),
		instant: false,
		startedAt: performance.now()
	});

	/**
	 * Whether this Printing's art has loaded before, and so can be painted without waiting.
	 *
	 * Checked per render rather than reactively — see `loadedOnce`. Being known does three things:
	 * the real image starts visible instead of at `opacity-0`, the ThumbHash starts hidden, and the
	 * image is decoded **synchronously**, which is what lets the browser paint it on the very first
	 * frame the element exists rather than one frame later. Without the sync decode there is still a
	 * frame with nothing in it, and a frame is exactly long enough to read as a blink.
	 *
	 * If the cache has evicted the image since, that first frame shows the card's Colour tint —
	 * stage one of the placeholder ladder — rather than the blur, until the fetch lands. A fair
	 * trade: eviction is rare, and re-blurring a card you have been looking at is the visible bug.
	 */
	const known = $derived(loadedOnce.has(printingId));
</script>

<div class="relative card-frame overflow-hidden {COLOR_TINT[color]} {className}">
	<img
		src={placeholder}
		alt=""
		aria-hidden="true"
		class="absolute inset-0 size-full scale-105 blur-md transition-opacity {paint.instant
			? 'duration-0'
			: 'duration-300'}"
		class:opacity-0={paint.loaded || known}
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
		decoding={known ? 'sync' : 'async'}
		onload={() => {
			loadedOnce.add(printingId);
			paint = {
				...paint,
				loaded: true,
				instant: performance.now() - paint.startedAt < CACHED_MS
			};
		}}
		class="relative size-full transition-opacity {paint.instant ? 'duration-0' : 'duration-500'}"
		class:opacity-0={!paint.loaded && !known}
	/>
</div>
