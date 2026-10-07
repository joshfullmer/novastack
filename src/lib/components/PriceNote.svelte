<script lang="ts">
	/**
	 * What the prices beside it are, and from when — said once above a group of `PriceLinks`
	 * rather than repeated on every tile. It names the two measures because they are different
	 * ones (TCGplayer's market price is recent sales; Cardmarket's trend is a smoothed average),
	 * and the currencies because neither is converted.
	 *
	 * Renders only if at least one of the given Printings has a quote, so a French tab with no
	 * prices at all doesn't carry a footnote about prices that are not there.
	 */
	import { formatUpdated } from '#lib/prices/format.js';
	import { prices } from '#lib/prices/state.svelte.js';

	let { printingIds, class: className = '' }: { printingIds: readonly string[]; class?: string } =
		$props();

	$effect(() => {
		void prices.load();
	});

	const quotes = $derived(
		prices.status === 'ready' ? printingIds.map((id) => prices.quote(id)) : []
	);
	const parts = $derived(
		[
			quotes.some((quote) => quote?.tcgplayer) && prices.tcgplayerUpdatedAt
				? `TCGplayer market price, USD, as of ${formatUpdated(prices.tcgplayerUpdatedAt)}`
				: null,
			quotes.some((quote) => quote?.cardmarket) && prices.cardmarketUpdatedAt
				? `Cardmarket trend price, EUR, as of ${formatUpdated(prices.cardmarketUpdatedAt)}`
				: null
		].filter((part) => part !== null)
	);
</script>

{#if parts.length > 0}
	<p class="text-xs text-muted {className}">{parts.join(' · ')}</p>
{/if}
