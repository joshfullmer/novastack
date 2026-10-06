<script lang="ts">
	/**
	 * An arrow dropping into a tray. Stroked in `currentColor`, so callers set it with a text
	 * colour. Decorative: whatever button carries it must name itself with `aria-label`.
	 */
	let { class: className = '' }: { class?: string } = $props();
</script>

<svg
	viewBox="0 0 24 24"
	class={className}
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	role="presentation"
	aria-hidden="true"
>
	<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
</svg>
