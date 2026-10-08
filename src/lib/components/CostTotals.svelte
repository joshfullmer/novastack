<script lang="ts">
	/**
	 * "To buy" — one total per marketplace, each in its own currency and each saying how many of the
	 * items it covers.
	 *
	 * The coverage is what makes a total honest: `$3.20 · 5 of 7 cards` is a floor over the five it
	 * could price, not the price of seven. Marketplaces are never added together or converted
	 * (`#lib/prices/format.js`), and one that prices nothing is simply absent rather than shown as
	 * zero. Renders nothing at all when neither prices anything.
	 */
	import {
		MARKETPLACE_INFO,
		MARKETPLACES,
		type Marketplace,
		type MarketplaceTotal
	} from '#lib/prices/cost.js';
	import { formatMoney } from '#lib/prices/format.js';

	let {
		totals,
		of: count,
		noun,
		class: className = ''
	}: {
		totals: Record<Marketplace, MarketplaceTotal>;
		/** How many items the totals were taken over — the denominator of "N of M". */
		of: number;
		noun: 'card' | 'printing';
		class?: string;
	} = $props();

	const shown = $derived(MARKETPLACES.filter((marketplace) => totals[marketplace].priced > 0));
</script>

{#if shown.length > 0}
	<p class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs {className}">
		<span class="text-muted">To buy</span>
		{#each shown as marketplace (marketplace)}
			{@const { name, currency } = MARKETPLACE_INFO[marketplace]}
			<span class="text-muted">
				{name}
				<span class="font-mono text-sm text-bright tabular-nums"
					>{formatMoney(totals[marketplace].total, currency)}</span
				>
				<span class="text-muted/70 tabular-nums"
					>· {totals[marketplace].priced} of {count}
					{noun}{count === 1 ? '' : 's'}</span
				>
			</span>
		{/each}
	</p>
{/if}
