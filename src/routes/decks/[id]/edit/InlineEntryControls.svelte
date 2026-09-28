<script lang="ts">
	/**
	 * PROTOTYPE — DELETE ME. Variant **E**: no modal, but the rail is wide enough for real controls.
	 *
	 * Round 1's affordances were the right idea at the wrong size — 18px chips in a 360px rail. This
	 * is the same idea given room: the deck panel widens to 480px (see `+page.svelte`), the Gallery
	 * drops to 3 columns so tiles are ~140px instead of ~80px, and the controls are sized for a
	 * pointer rather than squeezed between a name and a `−`.
	 *
	 * The printing control is a **cycler plus a label**, not a grid: with no overlay anywhere in this
	 * variant, the art that changes is the tile itself. That's E's bet — you evaluate the printing in
	 * place, in the deck, at deck size — and its cost, which the round should judge, is that you
	 * can't see the alternatives before you land on them.
	 */
	import { printTreatment } from '#lib/cards/derive.js';
	import { setLabel } from '#lib/collection/printing-search.js';
	import type { Card } from '#lib/cards/schema.js';
	import type { DeckState } from '#lib/decks/deck-state.svelte.js';
	import { printingPrototype as proto } from './printing-prototype.svelte.js';

	let {
		card,
		deck,
		pile = 'deck'
	}: { card: Card; deck: DeckState; pile?: 'deck' | 'sideboard' } = $props();

	const printing = $derived(proto.printingFor(card));
	const count = $derived(pile === 'deck' ? deck.quantityOf(card) : deck.sideboardQuantityOf(card));
	const canAdd = $derived(pile === 'deck' ? deck.canAddCopy(card) : deck.canAddToSideboard(card));

	function add() {
		if (pile === 'deck') deck.addCard(card);
		else deck.addToSideboard(card);
	}
	function remove() {
		if (pile === 'deck') deck.removeCard(card);
		else deck.removeFromSideboard(card);
	}
</script>

<div class="flex items-center justify-between gap-2">
	<!-- Copies: sized to be hit without aiming. -->
	<span class="flex shrink-0 items-center gap-1.5">
		<button
			type="button"
			onclick={remove}
			disabled={count === 0}
			aria-label="One fewer {card.name}"
			class="size-6 rounded border border-edge text-muted transition-colors hover:border-card-red
				hover:text-card-red disabled:opacity-30">−</button
		>
		<span class="min-w-4 text-center text-sm font-medium text-bright tabular-nums">{count}</span>
		<button
			type="button"
			onclick={add}
			disabled={!canAdd}
			aria-label="One more {card.name}"
			class="size-6 rounded border border-edge text-muted transition-colors hover:border-neon-dim
				hover:text-neon disabled:opacity-30">+</button
		>
	</span>

	<!-- Printing: the set label earns its space here in a way it couldn't at 360px, because a bare
	     collector number tells you nothing about which printing you just landed on. -->
	<span
		class="flex min-w-0 items-center gap-1 rounded border border-edge px-1"
		class:border-neon-dim={!proto.isDefault(card)}
	>
		<button
			type="button"
			onclick={() => proto.cycle(card, -1)}
			aria-label="Previous printing of {card.name}"
			class="shrink-0 px-0.5 text-muted transition-colors hover:text-neon">‹</button
		>
		<span
			class="min-w-0 truncate font-mono text-[0.6rem] tabular-nums"
			class:text-neon={!proto.isDefault(card)}
			class:text-muted={proto.isDefault(card)}
			title="{setLabel(printing.setId)} · {printTreatment(printing)} · {printing.locale}"
		>
			{printing.collectorNumber}{printing.locale !== 'en'
				? ` ${printing.locale.toUpperCase()}`
				: ''}
		</span>
		<button
			type="button"
			onclick={() => proto.cycle(card, 1)}
			aria-label="Next printing of {card.name}"
			class="shrink-0 px-0.5 text-muted transition-colors hover:text-neon">›</button
		>
	</span>
</div>
