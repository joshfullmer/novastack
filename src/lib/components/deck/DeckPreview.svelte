<script lang="ts">
	// The big card beside a deck: the one being pointed at, with its name, badges and stats. Shared by a
	// saved deck's page and the tournament deck, so a card reads the same wherever a deck is shown.
	import CardImage from '#lib/components/CardImage.svelte';
	import CardMetaBadges from '#lib/components/CardMetaBadges.svelte';
	import CardStats from '#lib/components/CardStats.svelte';
	import { COLOR_TEXT } from '#lib/components/color.js';
	import { splitCardName } from '#lib/cards/derive.js';
	import type { Card } from '#lib/cards/schema.js';
	import { deckPrinting } from '#lib/decks/printing.js';

	let {
		card,
		printingId,
		sizes = '240px'
	}: { card: Card | null; printingId?: string; sizes?: string } = $props();

	const printing = $derived(card === null ? null : deckPrinting(card, printingId));
	const parts = $derived(card === null ? null : splitCardName(card));
</script>

{#if card && printing}
	<div class="card-frame overflow-hidden rounded-lg border border-edge">
		<CardImage
			printingId={printing.id}
			thumbhash={printing.thumbhash}
			color={card.color}
			alt={card.name}
			{sizes}
		/>
	</div>
	<p class="mt-2 text-sm font-medium uppercase {COLOR_TEXT[card.color]}">{parts?.name}</p>
	{#if parts?.subtitle}
		<p class="text-xs font-medium tracking-wide text-muted uppercase">{parts.subtitle}</p>
	{/if}

	<div class="mt-2">
		<CardMetaBadges {card} compact />
	</div>

	<CardStats {card} showCost={false} class="mt-2" />
{:else}
	<div
		class="flex card-frame items-center justify-center rounded-lg border border-edge bg-surface text-sm
		text-muted"
	>
		No cards yet
	</div>
{/if}
