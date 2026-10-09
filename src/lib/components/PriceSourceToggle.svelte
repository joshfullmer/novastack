<script lang="ts">
	/**
	 * TCGplayer | Cardmarket — which marketplace every price on the site comes from.
	 *
	 * Small enough to sit inside a footnote, because that is where it lives: next to the one line
	 * that says which prices you are looking at. The choice is global and remembered
	 * (`#lib/prices/source.svelte.ts`), so changing it here changes every price on the page at once.
	 * `size="md"` is the same control at settings-page size, for the Account page.
	 */
	import { MARKETPLACE_INFO, MARKETPLACES } from '#lib/prices/cost.js';
	import { priceSource } from '#lib/prices/source.svelte.js';

	let { size = 'sm', class: className = '' }: { size?: 'sm' | 'md'; class?: string } = $props();
</script>

<span
	role="group"
	aria-label="Show prices from"
	class="inline-flex overflow-hidden rounded-md border border-edge {size === 'md'
		? 'text-sm'
		: 'text-[0.7rem]'} {className}"
>
	{#each MARKETPLACES as marketplace (marketplace)}
		<button
			type="button"
			aria-pressed={priceSource.value === marketplace}
			onclick={() => priceSource.set(marketplace)}
			class="{size === 'md'
				? 'px-3 py-1.5'
				: 'px-2 py-0.5'} transition-colors {priceSource.value === marketplace
				? 'bg-neon text-void'
				: 'text-body hover:bg-raised'}">{MARKETPLACE_INFO[marketplace].name}</button
		>
	{/each}
</span>
