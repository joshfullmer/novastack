<script lang="ts">
	// The "×3" stamped on a card's art. Same chamfered-corner clip as the Eddiable "€$" badge
	// (`CardStats.svelte`): the printed card's own UI chrome shape, not a generic rounded square. Two
	// layers because a `border` can't follow an angled `clip-path` edge: `eddie-badge` is the `bright`
	// "ring", `eddie-badge-inset` sits 2px inside it in void, a hollow outline rather than a solid fill, so
	// the badge reads as a tag stamped on the card rather than a sticker covering it. Plain white, not
	// `neon` or a tinted accent: it reads clearly against any of the four card colours without picking a
	// side among them.
	let { quantity }: { quantity: number } = $props();
</script>

<span
	class="pointer-events-none absolute bottom-1 left-1/2 isolate inline-flex size-6 -translate-x-1/2
	items-center justify-center"
>
	<span class="absolute inset-0 bg-bright eddie-badge"></span>
	<span class="absolute inset-[2px] bg-void eddie-badge-inset"></span>
	<span class="relative z-10 text-sm font-black text-bright tabular-nums">×{quantity}</span>
</span>
