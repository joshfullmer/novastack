<script lang="ts">
	// A Tournament Deck as columns: Legends, main deck, sideboard. Plain text on purpose — the lists
	// are for reading, the art is on the row above them.
	import { cardName } from '#lib/tournaments/present.js';
	import type { CardCount, DeckView } from '#lib/tournaments/event-view.js';

	let { deck, columns = 3 }: { deck: DeckView; columns?: 1 | 3 } = $props();

	const total = (cards: CardCount[]) => cards.reduce((n, card) => n + card.quantity, 0);
</script>

{#snippet column(title: string, cards: CardCount[])}
	<div class="min-w-0">
		<h4 class="mb-1 font-mono text-[11px] tracking-wide text-muted uppercase">{title}</h4>
		<ul class="space-y-px text-xs leading-5">
			{#each cards as card (card.slug)}
				<li class="flex gap-2">
					<span class="w-4 text-right font-mono text-neon-dim">{card.quantity}</span>
					<span class="truncate text-body">{cardName(card.slug)}</span>
				</li>
			{/each}
		</ul>
	</div>
{/snippet}

<div class="grid gap-4 {columns === 3 ? 'sm:grid-cols-3' : ''}">
	{@render column(
		'Legends',
		deck.legends.map((slug) => ({ slug, quantity: 1 }))
	)}
	{@render column(`Main · ${total(deck.main)}`, deck.main)}
	{#if deck.side.length > 0}{@render column(`Side · ${total(deck.side)}`, deck.side)}{/if}
</div>
{#if deck.unresolved > 0}
	<p class="mt-3 text-[11px] text-muted">
		{deck.unresolved} line{deck.unresolved === 1 ? '' : 's'} of this list didn't match a known card.
	</p>
{/if}
