<script lang="ts" module>
	/** How long a pointer must rest on a token before its explanation opens. */
	const HOVER_DELAY_MS = 400;

	/** Moving along a line should read like one gesture: a token opened within this long of the last
	 * one closing skips the wait, so you pay the delay once per line and not once per token. */
	const CARRY_OVER_MS = 300;

	let lastClosedAt = -Infinity;
</script>

<script lang="ts">
	/**
	 * One piece of notation that explains itself — `-B2`, `(`, `..` — in plain English on demand.
	 *
	 * A tooltip is hover-only by nature and a scoresheet gets read on phones, so the token is a real
	 * `<button>` and all three ways of asking arrive at the same sentence:
	 *
	 * - **Pointer** — rest on it for {@link HOVER_DELAY_MS}; leave to close.
	 * - **Keyboard** — focus it (only `:focus-visible`, so a mouse click does not also pop it open);
	 *   Escape closes it, and tabbing along a line reads the line.
	 * - **Touch** — tap to toggle; tapping anywhere else closes it. A tap's focus is not
	 *   `:focus-visible` and iOS Safari does not focus buttons at all, which is why the outside tap
	 *   is a window listener rather than a blur.
	 *
	 * The text is wired with `aria-describedby`, so a screen reader hears it on focus. Not the place
	 * for anything interactive: it is `pointer-events-none` and dismisses itself. For a disclosure
	 * that holds controls, see `InfoPopover`.
	 *
	 * The host must not clip overflow, and the panel measures itself once it opens so it stays on
	 * screen rather than running off the edge of a narrow viewport.
	 *
	 * `onPaper` is for a token written on the scoresheet: the site's raised grey is muddy against
	 * white, so the panel goes to the page's own near-black with a deep shadow. And a sheet shown at
	 * a tilt sets `--paper-tilt` on itself, which the panel counter-rotates by, so the hover text
	 * stays level on a page that is not.
	 */
	import type { Snippet } from 'svelte';

	/** The least space to leave between the panel and the screen's edge, in pixels. */
	const EDGE_MARGIN = 8;

	let {
		tip,
		children,
		onPaper = false,
		class: className = ''
	}: { tip: string; children: Snippet; onPaper?: boolean; class?: string } = $props();

	const tipId = $props.id();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pointerType = 'mouse';

	function show() {
		clearTimeout(timer);
		open = true;
	}

	function hide() {
		clearTimeout(timer);
		if (open) lastClosedAt = performance.now();
		open = false;
	}

	function onpointerenter(event: PointerEvent) {
		// Touch fires `pointerenter` on tap as well; the click handler owns that case.
		if (event.pointerType !== 'mouse') return;
		const carried = performance.now() - lastClosedAt < CARRY_OVER_MS;
		timer = setTimeout(show, carried ? 0 : HOVER_DELAY_MS);
	}

	function onfocus(event: FocusEvent) {
		if ((event.currentTarget as HTMLElement).matches(':focus-visible')) show();
	}

	/** Keep the panel inside the viewport horizontally, centred on the token otherwise. */
	function keepOnScreen(node: HTMLElement) {
		const { left, right } = node.getBoundingClientRect();
		const overflow = right - (window.innerWidth - EDGE_MARGIN);
		// Added to the panel's own `-50%` centring, not substituted for it.
		if (overflow > 0) node.style.translate = `calc(-50% - ${overflow}px) 0`;
		else if (left < EDGE_MARGIN) node.style.translate = `calc(-50% + ${EDGE_MARGIN - left}px) 0`;
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		if (open && root && !root.contains(event.target as Node)) hide();
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape' && open) hide();
	}}
/>

<span bind:this={root} class="relative inline-block">
	<button
		type="button"
		class="cursor-help rounded-sm decoration-dotted underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-1 focus-visible:outline-neon {className}"
		aria-describedby={open ? tipId : undefined}
		onpointerdown={(event) => (pointerType = event.pointerType)}
		{onpointerenter}
		onpointerleave={hide}
		{onfocus}
		onblur={hide}
		onclick={() => {
			// A mouse already opened it by hovering; only a finger needs the click to do it.
			if (pointerType !== 'mouse') (open ? hide : show)();
		}}
	>
		{@render children()}
	</button>{#if open}
		<span
			id={tipId}
			role="tooltip"
			use:keepOnScreen
			class="pointer-events-none absolute top-full left-1/2 z-40 mt-2 w-max max-w-64 -translate-x-1/2 [rotate:calc(var(--paper-tilt,0deg)*-1)] rounded-md border px-2.5 py-1.5 font-sans text-xs leading-snug {onPaper
				? 'border-void bg-void text-bright shadow-[0_10px_28px_-4px_rgb(0_0_0/0.6)]'
				: 'border-edge bg-raised text-body shadow-lg'}"
		>
			{tip}
		</span>
	{/if}
</span>
