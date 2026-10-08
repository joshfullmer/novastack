<script lang="ts">
	/**
	 * What the prices beside it are, and from when — said once above a group of `PriceLinks` rather
	 * than repeated on every tile — with the switch between TCGplayer and Cardmarket next to it,
	 * since this line is the one place on every price surface that says which one you are looking at.
	 *
	 * It names the measure (TCGplayer's market price is recent sales; Cardmarket's trend is a
	 * smoothed average) and the currency, because neither is converted.
	 *
	 * Renders only if at least one of the given Printings is listed on *either* marketplace, so a
	 * French tab with no prices at all doesn't carry a footnote about prices that are not there. When
	 * the chosen marketplace lists none of them but the other does, it says so — and the toggle is
	 * right there to go and look.
	 */
	import { listingOn, MARKETPLACE_INFO, MARKETPLACES } from '#lib/prices/cost.js';
	import { formatUpdated } from '#lib/prices/format.js';
	import { priceSource } from '#lib/prices/source.svelte.js';
	import { prices } from '#lib/prices/state.svelte.js';
	import PriceSourceToggle from './PriceSourceToggle.svelte';

	let { printingIds, class: className = '' }: { printingIds: readonly string[]; class?: string } =
		$props();

	$effect(() => {
		void prices.load();
	});

	const quotes = $derived(
		prices.status === 'ready' ? printingIds.map((id) => prices.quote(id)) : []
	);
	const anyListed = $derived(
		quotes.some((quote) => MARKETPLACES.some((m) => listingOn(quote, m) !== null))
	);

	const description = $derived.by(() => {
		const marketplace = priceSource.value;
		const { name, currency, measure } = MARKETPLACE_INFO[marketplace];
		const updatedAt =
			marketplace === 'tcgplayer' ? prices.tcgplayerUpdatedAt : prices.cardmarketUpdatedAt;
		return quotes.some((quote) => listingOn(quote, marketplace) !== null) && updatedAt
			? `${measure}, ${currency}, as of ${formatUpdated(updatedAt)}`
			: `not listed on ${name}`;
	});
</script>

{#if anyListed}
	<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted {className}">
		<PriceSourceToggle />
		<span class="whitespace-nowrap">{description}</span>
	</p>
{/if}
