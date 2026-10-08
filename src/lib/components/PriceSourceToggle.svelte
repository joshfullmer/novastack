<script lang="ts">
	/**
	 * TCGplayer | Cardmarket — which marketplace every price on the site comes from.
	 *
	 * Small enough to sit inside a footnote, because that is where it lives: next to the one line
	 * that says which prices you are looking at. The choice is global and remembered
	 * (`#lib/prices/source.svelte.ts`), so changing it here changes every price on the page at once.
	 */
	import { MARKETPLACE_INFO, MARKETPLACES } from '#lib/prices/cost.js';
	import { priceSource } from '#lib/prices/source.svelte.js';

	let { class: className = '' }: { class?: string } = $props();
</script>

<span
	role="group"
	aria-label="Show prices from"
	class="inline-flex overflow-hidden rounded-md border border-edge text-[0.7rem] {className}"
>
	{#each MARKETPLACES as marketplace (marketplace)}
		<button
			type="button"
			aria-pressed={priceSource.value === marketplace}
			onclick={() => priceSource.set(marketplace)}
			class="px-2 py-0.5 transition-colors {priceSource.value === marketplace
				? 'bg-neon text-void'
				: 'text-body hover:bg-raised'}">{MARKETPLACE_INFO[marketplace].name}</button
		>
	{/each}
</span>
