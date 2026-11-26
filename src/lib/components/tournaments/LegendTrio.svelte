<script lang="ts">
	/**
	 * A deck's Legends as the small overlapped stack the meta pages use for scanning, which opens to
	 * the same Legends at a readable size while a mouse is over it.
	 *
	 * The stack is too small to read a Legend from — that is the point of it, a row has room for one
	 * and a glance is enough to tell decks apart — so the hover is what makes the art worth showing
	 * at all. Mouse only: a touch has no hover, and a popup raised by a tap would sit between the
	 * reader and the link the row is.
	 *
	 * The large version is a manual popover, which puts it in the top layer. The stacks live inside
	 * scrolling tables and truncating rows, any of which would clip a panel positioned against them.
	 */
	import LegendArt from './LegendArt.svelte';

	/** The least space to leave between the panel and the screen's edge, and between it and the stack. */
	const MARGIN = 8;

	let {
		legends,
		artClass = '',
		sizes = '40px',
		class: className = ''
	}: {
		legends: readonly string[];
		/** Applied to each small Legend — its width, and the ring that separates the overlapped ones. */
		artClass?: string;
		/** Of the small Legends, as `LegendArt` takes it. The large ones always load at their own size. */
		sizes?: string;
		/** On the stack: its spacing, direction and flex behaviour. */
		class?: string;
	} = $props();

	let root = $state<HTMLElement>();
	let open = $state(false);

	/**
	 * Shown, measured and placed in one go, because where it goes depends on its own size: centred
	 * under the stack, flipped above it when the screen's bottom edge is in the way, and held inside
	 * the screen's sides. The panel's height is known at once — every card frame has a fixed aspect
	 * ratio — so there is no image-load jump to wait out.
	 *
	 * Closes on any scroll, since a wheel turned under a still pointer moves the stack out from
	 * beneath the panel without a `pointerleave`.
	 */
	function place(node: HTMLElement) {
		node.showPopover();
		const anchor = root!.getBoundingClientRect();
		const { width, height } = node.getBoundingClientRect();
		const fitsBelow = anchor.bottom + MARGIN + height <= innerHeight - MARGIN;
		const left = anchor.left + anchor.width / 2 - width / 2;
		node.style.left = `${Math.max(MARGIN, Math.min(left, innerWidth - width - MARGIN))}px`;
		node.style.top = `${fitsBelow ? anchor.bottom + MARGIN : Math.max(MARGIN, anchor.top - MARGIN - height)}px`;

		const close = () => (open = false);
		addEventListener('scroll', close, { capture: true, passive: true });
		return () => removeEventListener('scroll', close, { capture: true });
	}
</script>

<span
	bind:this={root}
	role="presentation"
	class="flex {className}"
	onpointerenter={(event) => (open = event.pointerType === 'mouse')}
	onpointerleave={() => (open = false)}
>
	<!-- First, so the stack's `space-x` still finds the last Legend as its last child. -->
	{#if open && legends.length > 0}
		<span
			{@attach place}
			popover="manual"
			aria-hidden="true"
			class="pointer-events-none inset-auto m-0 flex w-max max-w-[calc(100vw-1rem)] gap-2 overflow-visible
				border-0 bg-transparent p-0"
		>
			{#each legends as slug (slug)}
				<LegendArt {slug} sizes="160px" class="w-40 min-w-0 shadow-2xl shadow-void" />
			{/each}
		</span>
	{/if}
	{#each legends as slug (slug)}
		<LegendArt {slug} {sizes} class={artClass} />
	{/each}
</span>
