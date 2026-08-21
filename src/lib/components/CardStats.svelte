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
	import type { Card } from '#lib/cards/schema.js';

	let { card, class: className = '' }: { card: Card; class?: string } = $props();

	const entries = $derived([
		{ label: 'Cost', value: card.cost },
		{ label: 'Power', value: card.power },
		card.cardType === 'Legend'
			? { label: 'RAM provided', value: card.ramProvided }
			: { label: 'RAM required', value: card.ramRequired }
	]);
</script>

<dl class="flex flex-wrap gap-x-4 gap-y-1 text-sm {className}">
	{#each entries as entry (entry.label)}
		<div class="flex items-baseline gap-1.5">
			<dt class="text-xs tracking-wide text-muted uppercase">{entry.label}</dt>
			<dd class="font-medium text-bright tabular-nums">
				{entry.value ?? '—'}
			</dd>
		</div>
	{/each}
	{#if card.eddiable}
		<div class="flex items-baseline gap-1.5">
			<dt class="text-xs tracking-wide text-muted uppercase">Eddiable</dt>
			<dd class="font-medium text-bright">yes</dd>
		</div>
	{/if}
</dl>
