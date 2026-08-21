<script lang="ts">
	/**
	 * The novastack mark: a 3×3 grid of outlined squares, rotated 45° — a card grid stood on its
	 * corner.
	 *
	 * Two numbers carry the whole design, and they trade against each other:
	 *
	 * - **Rotated 45°, the block's bounding box is its diagonal.** It fits the 32-unit viewBox only
	 *   if half-diagonal plus half the stroke is at most 16, which is what fixes the cell at 5.769.
	 * - **The gap must stay wider than the stroke.** The first attempt used a 1.5 stroke against a
	 *   1.4 gap, leaving *negative* clear space: adjacent outlines overlapped and the mark welded
	 *   into a solid diamond at tab size. At stroke 1.3 and gap 2.2 there is 0.9 of clear space, and
	 *   all nine squares stay legible down to 16px.
	 *
	 * Stroked in `currentColor` so callers set it with a text colour. The favicon at
	 * `src/lib/assets/favicon.svg` is the standalone twin of this file, with the accent baked in
	 * because a favicon cannot inherit anything.
	 */
	let { class: className = '', title }: { class?: string; title?: string } = $props();
</script>

<svg
	viewBox="0 0 32 32"
	class={className}
	role={title === undefined ? 'presentation' : 'img'}
	aria-label={title}
	aria-hidden={title === undefined ? 'true' : undefined}
>
	{#if title !== undefined}<title>{title}</title>{/if}
	<g
		transform="translate(16 16) rotate(45)"
		fill="none"
		stroke="currentColor"
		stroke-width="1.3"
		stroke-linejoin="round"
	>
		<rect x="-10.85" y="-10.85" width="5.77" height="5.77" rx="0.4" />
		<rect x="-2.88" y="-10.85" width="5.77" height="5.77" rx="0.4" />
		<rect x="5.08" y="-10.85" width="5.77" height="5.77" rx="0.4" />
		<rect x="-10.85" y="-2.88" width="5.77" height="5.77" rx="0.4" />
		<rect x="-2.88" y="-2.88" width="5.77" height="5.77" rx="0.4" />
		<rect x="5.08" y="-2.88" width="5.77" height="5.77" rx="0.4" />
		<rect x="-10.85" y="5.08" width="5.77" height="5.77" rx="0.4" />
		<rect x="-2.88" y="5.08" width="5.77" height="5.77" rx="0.4" />
		<rect x="5.08" y="5.08" width="5.77" height="5.77" rx="0.4" />
	</g>
</svg>
