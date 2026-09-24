<script lang="ts">
	/**
	 * The owned-count badge, with −/+ controls that appear on hover.
	 *
	 * Reads and writes `#lib/collection/state.svelte.ts` directly rather than taking a
	 * value-and-callback pair: a Collection is a singleton, every stepper on the page is editing
	 * the same one, and threading props through a grid would only create opportunities for two
	 * steppers to disagree about the same Printing.
	 *
	 * **The count is always visible; the buttons are not.** On a checklist the count is
	 * information you scan and the buttons are a tool you reach for, and a full-width control at
	 * the bottom of every tile covers printed rules text and the collector number. So this sits
	 * bottom-left, sized to the count alone, and grows the buttons on hover.
	 *
	 * The hover target is the **whole tile**, not this badge: the badge is ~18px wide, so
	 * requiring a hover on it would mean finding it first. The host therefore has to mark the tile
	 * `group/tile` — a deliberate coupling, and the reason it's stated here rather than left to be
	 * discovered.
	 *
	 * `focus-visible` on the buttons matters as much as hover: a zero-width, transparent button is
	 * still in the tab order (it isn't `display: none`), so it expands when Tabbed to and the
	 * control stays keyboard-reachable without a pointer.
	 *
	 * **The count sits last, not between the buttons.** With the badge anchored bottom-left,
	 * anything that changes width pushes everything to its right along — so a count in the middle
	 * moved `+` out from under the cursor the moment `×9` became `×10`, mid-click-sequence. With
	 * both buttons ahead of it, their positions are fixed no matter what the count reads, and only
	 * the count — which nobody clicks — reflows.
	 *
	 * `min-w-[2.75ch]` plus `tabular-nums` holds the badge at one width across `—` and `×1`–`×9`
	 * **while hovered**, which is the only time it matters: the fixed width exists so `+` doesn't
	 * drift mid-click, and at rest there is nothing to click. So it is a hover variant too, and the
	 * resting badge is exactly as wide as the number inside it.
	 *
	 * Everything that produced dead space to the left of the count is therefore hover-gated: the
	 * flex `gap` (which applies between items whatever their width, so two `gap-1`s showed even
	 * with both buttons at zero width) and the count's own `min-width` (which, right-aligned, left
	 * ~13px empty inside the span for a one-character `—`).
	 *
	 * The keyboard escape hatch is `has-[:focus-visible]`, **not** `:focus-within`, and the
	 * difference is load-bearing. A mouse click leaves focus on the button but does *not* match
	 * `:focus-visible` — browsers reserve that for keyboard interaction — so `:focus-within` held
	 * the gap and min-width open after the pointer left, while the buttons themselves (gated on
	 * `focus-visible`) had already collapsed. The badge sat wide with dead space on its left until
	 * you clicked elsewhere. Both now key off the same state the buttons do, so the container
	 * cannot disagree with its own contents.
	 *
	 * Signed out, it renders **disabled rather than hidden** — the feature is visible before it's
	 * usable, which converts better than hiding it, and the layout doesn't shift on sign-in.
	 *
	 * The badge carries a **border unconditionally**, not just when disabled. Card art runs from
	 * near-black to bright neon, so a fill alone disappears against some printings and glares
	 * against others; an outline gives it a constant edge to read against whatever is behind it.
	 *
	 * The −/+ are **SVG strokes, not text glyphs**. `place-items-center` centres a glyph's line
	 * box, not its ink, and `+`/`−` sit on the baseline with descender space below them — so
	 * centring the box leaves the mark visibly low. Correcting that with a nudge would be a
	 * per-font guess; a stroke centred in its own `viewBox` is centred by construction, in any
	 * font, at any size.
	 */
	import { collection } from '#lib/collection/state.svelte.js';

	let {
		printingId,
		label,
		/**
		 * Skips the hover reveal and shows the buttons permanently. For contexts with room to
		 * spare — the detail page's printings gallery — where hiding the controls behind a hover
		 * buys nothing, since nothing is being obscured.
		 */
		expanded = false
	}: { printingId: string; label: string; expanded?: boolean } = $props();

	const count = $derived(collection.quantityOf(printingId));
	const disabled = $derived(!collection.editable);

	// Written as whole literal strings rather than composed from fragments, so Tailwind's source
	// scanner sees every class it needs to generate.
	const revealClass = $derived(
		expanded ? 'gap-1' : 'gap-0 transition-[gap] group-hover/tile:gap-1 has-[:focus-visible]:gap-1'
	);
	const buttonRevealClass = $derived(
		expanded
			? 'w-5'
			: 'w-0 opacity-0 transition-all group-hover/tile:w-5 group-hover/tile:opacity-100 focus-visible:w-5 focus-visible:opacity-100'
	);
	const countRevealClass = $derived(
		expanded
			? 'min-w-[2.75ch]'
			: 'min-w-0 transition-[min-width] group-hover/tile:min-w-[2.75ch] group-has-[:focus-visible]/badge:min-w-[2.75ch]'
	);
</script>

<div
	class="group/badge pointer-events-auto flex w-fit items-center rounded-md border border-edge
		bg-void/95 px-1.5 py-1 shadow-sm backdrop-blur-sm {revealClass}"
>
	<button
		type="button"
		onclick={() => collection.adjust(printingId, -1)}
		disabled={disabled || count === 0}
		tabindex={count === 0 ? -1 : 0}
		title={collection.signedOut ? 'Sign in to track your collection' : undefined}
		class="grid h-5 place-items-center overflow-hidden rounded-sm text-muted hover:bg-raised
			hover:text-bright disabled:text-muted/30 disabled:hover:bg-transparent
			{buttonRevealClass}"
		aria-label="Remove a copy of {label}"
	>
		<svg viewBox="0 0 12 12" class="size-3" aria-hidden="true">
			<path d="M2.5 6h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		</svg>
	</button>

	<button
		type="button"
		onclick={() => collection.adjust(printingId, 1)}
		{disabled}
		title={collection.signedOut ? 'Sign in to track your collection' : undefined}
		class="grid h-5 place-items-center overflow-hidden rounded-sm text-neon hover:bg-raised
			hover:text-bright disabled:text-muted/30 disabled:hover:bg-transparent
			{buttonRevealClass}"
		aria-label="Add a copy of {label}"
	>
		<svg viewBox="0 0 12 12" class="size-3" aria-hidden="true">
			<path d="M6 2.5v7M2.5 6h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		</svg>
	</button>

	<span
		class="text-right font-mono text-xs tabular-nums {countRevealClass}
			{count === 0 ? 'text-muted/60' : 'text-bright'}"
		aria-live="polite">{count === 0 ? '—' : `×${count}`}</span
	>
</div>
