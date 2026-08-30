<script lang="ts">
	/**
	 * A card's numeric line.
	 *
	 * Every value here is nullable, and **a null is shown as `—`, never as 0.** `power: 0` is real
	 * on nine cards while `power: null` means the stat does not apply — all 27 Programs, for one —
	 * and collapsing the two would be a quiet lie about the card.
	 *
	 * RAM is labelled by direction: a Legend *provides* RAM, everything else *requires* it. The
	 * source API uses one field for both, which is exactly why the model splits them.
	 */
	import { formatCost, type Card } from '#lib/cards/schema.js';
	import { COLOR_TEXT, COLOR_TINT } from './color.js';

	/** `showCost` defaults on — off only for the card detail page, which draws Cost itself as a
	 * color-badge (matching the printed card's own cost-badge art) instead of a plain stat. */
	let {
		card,
		class: className = '',
		showCost = true
	}: { card: Card; class?: string; showCost?: boolean } = $props();

	const entries = $derived(
		[
			// Cost is always two digits and monospaced, matching the printed card's own Cost
			// badge (`formatCost` — `schema.ts`) — Power and RAM have no such printed convention.
			showCost ? { label: 'Cost', value: formatCost(card.cost), mono: true } : null,
			{ label: 'Power', value: card.power ?? '—', mono: false },
			card.cardType === 'Legend'
				? { label: 'RAM provided', value: card.ramProvided ?? '—', mono: false }
				: { label: 'RAM required', value: card.ramRequired ?? '—', mono: false }
		].filter((entry) => entry !== null)
	);
</script>

<dl class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm {className}">
	{#each entries as entry (entry.label)}
		<div class="flex items-baseline gap-1.5">
			<dt class="text-xs tracking-wide text-muted uppercase">{entry.label}</dt>
			<dd class="font-medium text-bright tabular-nums {entry.mono ? 'font-mono' : ''}">
				{entry.value}
			</dd>
		</div>
	{/each}
	{#if card.eddiable}
		<div class="flex items-baseline gap-1.5">
			<dt class="text-xs tracking-wide text-muted uppercase">Eddiable</dt>
			<dd>
				<!-- The "Eddiable" dt is the accessible signal (this row only exists when true) —
					the badge itself is decorative. -->
				<span class="relative isolate inline-flex h-6 items-center" aria-hidden="true">
					<span class="absolute inset-0 eddie-badge {COLOR_TINT[card.color]}"></span>
					<span class="absolute inset-[2px] bg-void eddie-badge-inset"></span>
					<span class="relative z-10 px-1.5 font-mono text-base font-bold {COLOR_TEXT[card.color]}">
						€$
					</span>
				</span>
			</dd>
		</div>
	{/if}
</dl>
