<script lang="ts">
	/**
	 * What this decklist costs — shown on the deck page, to anyone who can see the deck, for two
	 * different readers at once: the player showing off what they built, and the newcomer working out
	 * what it would take to build it themselves.
	 *
	 * - **As built** prices each card at the printing the deck *chose* for it, so a deck dressed in
	 *   expensive alt-arts says so; a card with no chosen printing is priced at its cheapest, since
	 *   nobody asked for any particular art.
	 * - **Cheapest** prices every card at its cheapest priced English printing — the figure for
	 *   *playing* the list, whatever art it's in.
	 *
	 * They only split when there is an art premium to show; otherwise there is one figure, "Whole deck"
	 * (the cheapest). That is the case when the owner can't choose printings, when every choice the
	 * deck made is the card's Default or cheapest printing, and when nothing was chosen at all. With a
	 * real choice made, the gap between the two is what the art costs.
	 *
	 * Whole list, not what the viewer is missing (that is the Collection tab's "To buy"), and over
	 * the Legends, main deck and sideboard together, the same set that tab uses. For the marketplace
	 * the reader chose (`#lib/prices/source.svelte.ts`), in its own currency.
	 *
	 * Each figure carries its coverage — `38/40 priced` — because a total over some of the cards is a
	 * floor. A figure with nothing priced reads `—`, never `$0.00`. Everything else is behind the (i).
	 */
	import type { NeededCard } from '#lib/collection/missing.js';
	import { deckCost, MARKETPLACE_INFO, type MarketplaceTotal } from '#lib/prices/cost.js';
	import { formatMoney } from '#lib/prices/format.js';
	import { priceSource } from '#lib/prices/source.svelte.js';
	import { prices } from '#lib/prices/state.svelte.js';
	import InfoPopover from './InfoPopover.svelte';
	import PriceNote from './PriceNote.svelte';

	let {
		entries,
		ownerCanChoosePrinting,
		class: className = ''
	}: {
		entries: readonly NeededCard[];
		/** Whether the deck's owner may choose Printings — see `+page.server.ts`. */
		ownerCanChoosePrinting: boolean;
		class?: string;
	} = $props();

	$effect(() => {
		void prices.load();
	});

	const marketplace = $derived(priceSource.value);
	const cost = $derived(deckCost(entries, (id) => prices.quote(id))[marketplace]);
	const { name, currency } = $derived(MARKETPLACE_INFO[marketplace]);
	const cards = $derived(cost.built.priced + cost.built.unpriced);
	const printingIds = $derived(
		entries.flatMap((entry) => entry.card.printings.map((printing) => printing.id))
	);

	const same = (a: MarketplaceTotal, b: MarketplaceTotal) =>
		a.total === b.total && a.priced === b.priced && a.unpriced === b.unpriced;

	// One figure unless there is an art premium to show. Not when the owner can't choose Printings
	// (whatever a lapsed grant left on the deck), and not when every choice made is the Default or
	// the cheapest — and, as a last guard, never two figures that say the same thing.
	const single = $derived(
		!ownerCanChoosePrinting || !cost.customised || same(cost.built, cost.cheapest)
	);
	const figures = $derived(
		single
			? [{ label: 'Whole deck', total: cost.cheapest }]
			: [
					{ label: 'As built', total: cost.built },
					{ label: 'Cheapest', total: cost.cheapest }
				]
	);
</script>

<!-- Only once the snapshot has loaded: before it, every figure would read `—` for a moment and look
     like a deck nobody sells. -->
{#if prices.status === 'ready' && cards > 0}
	<section
		aria-label="What this deck costs"
		class="relative rounded-xl border border-neon/60 bg-linear-to-br from-neon/15 via-neon/5
			to-transparent px-4 py-3.5 shadow-[0_0_28px_-8px] shadow-neon/40 {className}"
	>
		<div
			class="pointer-events-none absolute inset-x-5 top-0 h-px bg-linear-to-r from-transparent
				via-neon to-transparent"
			aria-hidden="true"
		></div>

		<div class="flex items-center justify-between gap-4">
			<p class="text-xs font-medium tracking-widest text-neon uppercase">Deck price</p>

			<InfoPopover label="About these prices" anchorToHost>
				<p>Each card at its cheapest priced English printing.</p>
				<p class="mt-1">As built: the art the deck chose, when that differs.</p>
				<p class="mt-1">Printings with no market price yet aren't counted.</p>
				<PriceNote {printingIds} class="mt-2 border-t border-edge pt-2" />
			</InfoPopover>
		</div>

		<div class="mt-2 grid gap-4 {figures.length === 2 ? 'grid-cols-2' : ''}">
			{#each figures as { label, total } (label)}
				<div class="min-w-0">
					<p class="text-xs text-muted">{label}</p>
					<p
						class="mt-0.5 font-mono text-xl font-semibold text-bright tabular-nums
							[text-shadow:0_0_18px_color-mix(in_oklab,var(--color-neon)_50%,transparent)]"
					>
						{total.priced > 0 ? formatMoney(total.total, currency) : '—'}
					</p>
					<p class="text-xs text-muted tabular-nums">{total.priced}/{cards} priced</p>
				</div>
			{/each}
		</div>

		<p class="mt-2 text-xs text-muted">{name} · {currency}</p>
	</section>
{/if}
