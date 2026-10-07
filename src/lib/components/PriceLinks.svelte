<script lang="ts">
	/**
	 * Where to buy one Printing, and what it costs there.
	 *
	 * One link per marketplace that lists it, each showing that marketplace's own price in its own
	 * currency — never converted, never merged (`#lib/prices/format.js`). The link is the point; the
	 * price is what makes it worth clicking.
	 *
	 * Three honest states for a price, all keeping the link:
	 * - a number, dimmed with its date once it is more than two days old
	 * - `no price yet` — the product exists but has no market (every English retail printing until
	 *   the 2026-11-06 release)
	 * - `price out of date` — a broken refresh left the file a week old, and a stale number would
	 *   mislead more than none
	 *
	 * A Printing no marketplace lists (the whole French run) renders nothing at all, rather than a
	 * row of dashes on a third of the gallery.
	 */
	import { formatMoney, formatUpdated, freshness, type Currency } from '#lib/prices/format.js';
	import { cardmarketUrl, tcgplayerUrl } from '#lib/prices/links.js';
	import { prices } from '#lib/prices/state.svelte.js';

	let { printingId, class: className = '' }: { printingId: string; class?: string } = $props();

	// Idempotent, and a no-op on the server: the snapshot is fetched, never rendered into the page.
	$effect(() => {
		void prices.load();
	});

	const quote = $derived(prices.quote(printingId));

	const sources = $derived.by(() => {
		const list: {
			name: string;
			url: string;
			amount: number | null;
			currency: Currency;
			updatedAt: string | null;
		}[] = [];

		if (quote?.tcgplayer) {
			list.push({
				name: 'TCGplayer',
				url: tcgplayerUrl(quote.tcgplayer.productId),
				amount: quote.tcgplayer.market,
				currency: 'USD',
				updatedAt: prices.tcgplayerUpdatedAt
			});
		}
		if (quote?.cardmarket) {
			list.push({
				name: 'Cardmarket',
				url: cardmarketUrl(quote.cardmarket.productId),
				amount: quote.cardmarket.trend,
				currency: 'EUR',
				updatedAt: prices.cardmarketUpdatedAt
			});
		}

		const now = Date.now();
		return list.map((source) => ({
			...source,
			age: source.updatedAt === null ? ('expired' as const) : freshness(source.updatedAt, now)
		}));
	});
</script>

{#if sources.length > 0}
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs {className}">
		{#each sources as source (source.name)}
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
		{/each}
	</div>
{/if}
