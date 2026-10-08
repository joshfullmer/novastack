<script lang="ts">
	/**
	 * "To buy" — the total for the marketplace the reader chose (`#lib/prices/source.svelte.ts`), in
	 * its own currency, saying how many of the items it covers.
	 *
	 * The coverage is what makes a total honest: `$3.20 · 5 of 7 cards` is a floor over the five it
	 * could price, not the price of seven. Renders nothing when the chosen marketplace prices nothing
	 * at all; the toggle in the price note is how to see the other.
	 */
	import { MARKETPLACE_INFO, type Marketplace, type MarketplaceTotal } from '#lib/prices/cost.js';
	import { formatMoney } from '#lib/prices/format.js';
	import { priceSource } from '#lib/prices/source.svelte.js';

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

	const marketplace = $derived(priceSource.value);
	const tally = $derived(totals[marketplace]);
	const { currency } = $derived(MARKETPLACE_INFO[marketplace]);
</script>

{#if tally.priced > 0}
	<p class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs {className}">
		<span class="text-muted">To buy</span>
		<span class="font-mono text-sm text-bright tabular-nums"
			>{formatMoney(tally.total, currency)}</span
		>
		<span class="text-muted/70 tabular-nums"
			>· {tally.priced} of {count}
			{noun}{count === 1 ? '' : 's'}</span
		>
	</p>
{/if}
