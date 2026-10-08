<script lang="ts">
	/**
	 * What the Collection is worth at market — the one number on `/collection` that is meant to be
	 * looked at, so it is a lit panel rather than a line of small print; and kept small, so it earns
	 * its place beside the title without taking over the page.
	 *
	 * Shows the marketplace the reader chose (`#lib/prices/source.svelte.ts`), in its own currency.
	 * The figure carries one short line of honesty — how many of the printings it could price — and
	 * everything else (why some have no price, which measure this is, the switch to the other
	 * marketplace) is behind the (i). That line stays on the panel on purpose: before 2026-11-06
	 * English retail has no market price, and a big `$0.84` over `1 of 5` has to read as a floor, not
	 * as the whole shelf.
	 *
	 * A marketplace that prices nothing for what you own reads `—`, not `$0.00`: nothing priced is not
	 * a price of nothing.
	 */
	import { MARKETPLACE_INFO, type Marketplace, type MarketplaceTotal } from '#lib/prices/cost.js';
	import { formatMoney } from '#lib/prices/format.js';
	import { priceSource } from '#lib/prices/source.svelte.js';
	import InfoPopover from './InfoPopover.svelte';
	import PriceNote from './PriceNote.svelte';

	let {
		totals,
		of: count,
		printingIds,
		class: className = ''
	}: {
		totals: Record<Marketplace, MarketplaceTotal>;
		/** Distinct printings owned — the denominator of "N of M". */
		of: number;
		/** For the note in the popover, which says which prices these are and as of when. */
		printingIds: readonly string[];
		class?: string;
	} = $props();

	const marketplace = $derived(priceSource.value);
	const tally = $derived(totals[marketplace]);
	const { name, currency } = $derived(MARKETPLACE_INFO[marketplace]);
	const plural = $derived(count === 1 ? '' : 's');
</script>

<section
	aria-label="What your collection is worth"
	class="relative rounded-xl border border-neon/60 bg-linear-to-br from-neon/15 via-neon/5
		to-transparent px-4 py-3.5 shadow-[0_0_28px_-8px] shadow-neon/40 {className}"
>
	<!-- A bright edge along the top, so the panel reads as lit rather than merely outlined. Inset
	     from the corners, which are rounded. -->
	<div
		class="pointer-events-none absolute inset-x-5 top-0 h-px bg-linear-to-r from-transparent
			via-neon to-transparent"
		aria-hidden="true"
	></div>

	<div class="flex items-center justify-between gap-6">
		<p class="text-xs font-medium tracking-widest text-neon uppercase">Collection worth</p>

		<InfoPopover label="About this figure" anchorToHost>
			<p class="font-medium text-body">{tally.priced} of {count} printing{plural} priced</p>
			<p class="mt-1.5">
				A printing with no market price yet isn't counted. That is every English retail printing
				until its release on 2026-11-06, so for now this is a floor, not the value of everything you
				own.
			</p>
			<p class="mt-1.5">Each printing is priced as itself, times the copies you hold.</p>
			<PriceNote {printingIds} class="mt-3 border-t border-edge pt-3" />
		</InfoPopover>
	</div>

	<p
		class="mt-1.5 font-mono text-3xl font-semibold text-bright tabular-nums
			[text-shadow:0_0_20px_color-mix(in_oklab,var(--color-neon)_50%,transparent)]"
	>
		{tally.priced > 0 ? formatMoney(tally.total, currency) : '—'}
	</p>
	<p class="mt-0.5 text-xs text-muted tabular-nums">
		{name} · {tally.priced}/{count} priced
	</p>
</section>
