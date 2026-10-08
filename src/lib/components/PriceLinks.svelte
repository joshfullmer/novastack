<script lang="ts">
	/**
	 * Where to buy one Printing, and what it costs there — on the marketplace the reader chose
	 * (`#lib/prices/source.svelte.ts`), in that marketplace's own currency, never converted.
	 *
	 * Three honest states for the price, all keeping the link:
	 * - a number, dimmed with its date once it is more than two days old
	 * - `no price yet` — the product exists but has no market (every English retail printing until
	 *   the 2026-11-06 release)
	 * - `price out of date` — a broken refresh left the file a week old, and a stale number would
	 *   mislead more than none
	 *
	 * A Printing the chosen marketplace does not list (the whole French run, and any Cardmarket art
	 * the join could not identify) renders nothing, rather than a row of dashes on a third of the
	 * gallery; the toggle in the price note is where to look at the other marketplace.
	 */
	import { listingOn, MARKETPLACE_INFO } from '#lib/prices/cost.js';
	import { formatMoney, formatUpdated, freshness } from '#lib/prices/format.js';
	import { priceSource } from '#lib/prices/source.svelte.js';
	import { prices } from '#lib/prices/state.svelte.js';

	let { printingId, class: className = '' }: { printingId: string; class?: string } = $props();

	// Idempotent, and a no-op on the server: the snapshot is fetched, never rendered into the page.
	$effect(() => {
		void prices.load();
	});

	const source = $derived.by(() => {
		const marketplace = priceSource.value;
		const listing = listingOn(prices.quote(printingId), marketplace);
		if (listing === null) return null;

		const updatedAt =
			marketplace === 'tcgplayer' ? prices.tcgplayerUpdatedAt : prices.cardmarketUpdatedAt;
		const { name, currency, url } = MARKETPLACE_INFO[marketplace];
		return {
			name,
			currency,
			url: url(listing.productId),
			amount: listing.amount,
			updatedAt,
			age: updatedAt === null ? ('expired' as const) : freshness(updatedAt, Date.now())
		};
	});
</script>

{#if source}
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs {className}">
		<a
			href={source.url}
			target="_blank"
			rel="noopener noreferrer"
			title={source.age === 'stale' && source.updatedAt !== null
				? `Price from ${formatUpdated(source.updatedAt)}`
				: `Buy on ${source.name}`}
			class="inline-flex items-baseline gap-1.5 text-muted transition-colors hover:text-neon"
		>
			<span>{source.name}</span>
			{#if source.amount !== null && source.age !== 'expired'}
				<span class="font-mono tabular-nums {source.age === 'fresh' ? 'text-body' : 'text-muted'}"
					>{formatMoney(source.amount, source.currency)}</span
				>
			{:else}
				<span class="text-muted/70"
					>{source.amount === null ? 'no price yet' : 'price out of date'}</span
				>
			{/if}
			<span aria-hidden="true">↗</span>
			<span class="sr-only">(opens in a new tab)</span>
		</a>
	</div>
{/if}
