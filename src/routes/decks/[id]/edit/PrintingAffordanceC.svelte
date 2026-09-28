<script lang="ts">
	/**
	 * PROTOTYPE — DELETE ME. Variant C: **cycle in place, no overlay at all**.
	 *
	 * `‹ 007 ›` stepped through the card's printings, and in Gallery mode the tile art swaps under
	 * your cursor as you step — the preview *is* the deck. Bet: most choices are "give me the beta
	 * one" or "give me the French one", which is a step or two away, and nothing needs to open for
	 * that. The `<select>` is the escape hatch for a 14-printing card where stepping is too slow.
	 *
	 * Cost, stated up front so the round is honest: you cannot see the alternatives before landing
	 * on them.
	 */
	import { printTreatment } from '#lib/cards/derive.js';
	import { setLabel } from '#lib/collection/printing-search.js';
	import type { Card } from '#lib/cards/schema.js';
	import { printingPrototype as proto } from './printing-prototype.svelte.js';

	let { card }: { card: Card } = $props();

	const current = $derived(proto.printingFor(card));
	const position = $derived(proto.indexFor(card) + 1);
</script>

<span
	class="flex shrink-0 items-center rounded border border-edge font-mono text-[0.6rem] tabular-nums"
	class:border-neon-dim={!proto.isDefault(card)}
>
	<button
		type="button"
		onclick={() => proto.cycle(card, -1)}
		aria-label="Previous printing of {card.name}"
		class="px-1 text-muted transition-colors hover:text-neon">‹</button
	>
	<!-- The number is a `<select>` rather than a label with a menu beside it: on a 14-printing card
	     stepping is the wrong tool, and a native select is the one control that needs no popover
	     code and still works on touch. -->
	<select
		value={current.id}
		onchange={(event) => proto.choose(card, event.currentTarget.value)}
		aria-label="Printing of {card.name}"
		title="{setLabel(current.setId)} · {printTreatment(current)}"
		class="max-w-16 appearance-none bg-transparent text-center text-muted focus:text-neon"
		class:text-neon={!proto.isDefault(card)}
	>
		{#each card.printings as printing (printing.id)}
			<option value={printing.id} class="bg-shell">
				{printing.collectorNumber}{printing.locale !== 'en' ? ` ${printing.locale}` : ''}
			</option>
		{/each}
	</select>
	<button
		type="button"
		onclick={() => proto.cycle(card, 1)}
		aria-label="Next printing of {card.name}"
		class="px-1 text-muted transition-colors hover:text-neon">›</button
	>
	<span class="border-l border-edge px-1 text-[0.5rem] text-muted/60">
		{position}/{card.printings.length}
	</span>
</span>
