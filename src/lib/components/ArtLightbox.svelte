<script module lang="ts">
	import { cardImageUrl } from '#lib/cards/schema.js';

	/**
	 * Fetch the zoomed art ahead of the click.
	 *
	 * The page's own art is a smaller tier than the lightbox wants, and 733w is 95 KB on average —
	 * enough that a click on a slow connection would otherwise open onto the smaller tier's pixels
	 * for a beat. Called on hover and focus of the trigger, never on mount: most visits to a card
	 * page never zoom, and this would be 95 KB spent on each of them.
	 */
	export function preloadZoomArt(printingId: string): void {
		new Image().src = cardImageUrl(printingId, 733);
	}
</script>

<script lang="ts">
	/**
	 * The card art, blown up to fit the viewport — the card lifts off the page and settles in the
	 * middle of the screen, then flies back to where it came from.
	 *
	 * The same idea as `CardDetailOverlay` (the overlay *is* the thing you clicked, bigger, not a
	 * dialog that appeared over it) and the same mechanism: a `transform` between the source's rect
	 * and the lightbox's own, never an animated width/height/left/top. Differences, on purpose:
	 *
	 * - **The scrim is our own element, not `::backdrop`.** A `::backdrop` can't be told to fade out
	 *   while the card flies home, so it would sit at full strength for the whole return and then
	 *   vanish on the frame the dialog closes. An element fades in step with the card in both
	 *   directions.
	 * - **The source is hidden while its twin is in the air**, so the card reads as lifting off the
	 *   page rather than being copied from it.
	 * - **Sized by the viewport, with no cap at the art's native size.** The largest art there is is
	 *   733×1024, so on a high-density display this is an upscale; that was a decision, not an
	 *   accident (`CardImage`'s ladder is still what every other surface uses).
	 *
	 * The 488w tier sits underneath as a background, so whichever pixels the page already has are on
	 * screen from the first frame of the flight and the 733w image paints over them when it lands.
	 *
	 * Open and close are driven by `open` rather than called, so the URL can own the state — the
	 * caller pushes a history entry to open, which is what makes Back close it.
	 */
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/env';

	let {
		open,
		printingId,
		alt,
		source,
		onClose
	}: {
		open: boolean;
		printingId: string;
		alt: string;
		/** The element the card flies from and back to, hidden while it is away. */
		source: HTMLElement | undefined;
		onClose: () => void;
	} = $props();

	const OPEN_MS = 420;
	const CLOSE_MS = 320;
	/** Decelerates hard into place — the card is still settling after the scrim has finished. */
	const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
	/** The way home is quicker and starts gently, so the return doesn't feel like a rewind. */
	const EASE_IN = 'cubic-bezier(0.32, 0, 0.2, 1)';

	let dialog = $state<HTMLDialogElement>();
	let hero = $state<HTMLElement>();
	let scrim = $state<HTMLElement>();

	/**
	 * Outlives `open` so the closing flight has something to fly. Rendering from `open` directly
	 * would remove the dialog on the tick the URL clears, and the card would simply vanish.
	 */
	let shown = $state(false);

	function reduceMotion(): boolean {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function setSourceVisible(visible: boolean) {
		if (source) source.style.visibility = visible ? '' : 'hidden';
	}

	/**
	 * Flies the hero between the source's rect and its own, and fades the scrim alongside.
	 *
	 * Scale from width alone: card art is a fixed 733:1024 everywhere, so one factor covers both axes.
	 * Centres rather than corners, because the transform scales about the centre.
	 */
	function fly(direction: 'in' | 'out'): Animation | null {
		if (!hero || !source) return null;

		const from = source.getBoundingClientRect();
		const to = hero.getBoundingClientRect();
		if (to.width === 0 || from.width === 0) return null;

		const scale = from.width / to.width;
		const shiftX = from.left + from.width / 2 - (to.left + to.width / 2);
		const shiftY = from.top + from.height / 2 - (to.top + to.height / 2);
		const sourceFrame = `translate(${shiftX}px, ${shiftY}px) scale(${scale})`;
		const frames = [{ transform: sourceFrame }, { transform: 'translate(0, 0) scale(1)' }];
		const fade = [{ opacity: 0 }, { opacity: 1 }];
		const options = {
			duration: direction === 'in' ? OPEN_MS : CLOSE_MS,
			easing: direction === 'in' ? EASE_OUT : EASE_IN,
			fill: 'forwards' as const
		};

		scrim?.animate(direction === 'in' ? fade : fade.toReversed(), {
			...options,
			easing: 'linear'
		});
		return hero.animate(direction === 'in' ? frames : frames.toReversed(), options);
	}

	$effect(() => {
		if (open === shown) return;
		if (open) void show();
		else void hide();
	});

	async function show() {
		shown = true;
		await tick();
		if (!dialog?.isConnected) return;

		dialog.showModal();
		// `<dialog>` blocks interaction with the page behind it but not scrolling it.
		document.documentElement.style.overflow = 'hidden';

		if (reduceMotion()) {
			setSourceVisible(false);
			return;
		}
		// Hidden in the same frame the flight starts, or the page's copy shows beside it for one paint.
		setSourceVisible(false);
		fly('in');
	}

	async function hide() {
		const animation = reduceMotion() ? null : fly('out');
		await animation?.finished.catch(() => undefined);

		// Neither the lock nor the source's visibility may depend on the dialog still being around.
		dialog?.close();
		document.documentElement.style.overflow = '';
		setSourceVisible(true);
		shown = false;
	}

	onDestroy(() => {
		if (!browser) return;
		document.documentElement.style.overflow = '';
		setSourceVisible(true);
	});
</script>

{#if shown}
	<!--
		Any click lands here — the art is a `<button>` so the keyboard has a way to close it, and its
		Enter/Space click bubbles to this same handler. Esc arrives as `cancel` *before* `close`;
		cancelling it is what lets the card fly home instead of the dialog vanishing on the spot.
	-->
	<dialog
		bind:this={dialog}
		oncancel={(event) => {
			event.preventDefault();
			onClose();
		}}
		onclose={() => {
			// Defensive: whatever closed the dialog, our state and the page behind have to agree.
			shown = false;
			if (browser) document.documentElement.style.overflow = '';
			setSourceVisible(true);
		}}
		onclick={onClose}
		aria-label={alt}
		class="m-0 h-dvh max-h-none w-dvw max-w-none cursor-zoom-out overflow-hidden bg-transparent
			p-0 backdrop:bg-transparent"
	>
		<div bind:this={scrim} class="absolute inset-0 bg-void/85 backdrop-blur-md"></div>

		<div class="relative grid size-full place-items-center">
			<!-- `h-[min(…)]` is the fit: the viewport's height, or the width if the card would be wider
			     than the screen. The aspect ratio is fixed, so the width follows. -->
			<button
				bind:this={hero}
				type="button"
				aria-label="Close enlarged art"
				style:background-image="url({cardImageUrl(printingId, 488)})"
				class="block aspect-[733/1024] h-[min(92dvh,calc(94vw*1024/733))] cursor-zoom-out bg-cover
					drop-shadow-[0_30px_60px_rgb(0_0_0/0.7)] will-change-transform"
			>
				<img
					src={cardImageUrl(printingId, 733)}
					{alt}
					width="733"
					height="1024"
					decoding="async"
					class="size-full"
				/>
			</button>
		</div>
	</dialog>
{/if}
