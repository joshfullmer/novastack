<script lang="ts">
	// A deck's sideboard, framed apart from the main deck. Follows the same List / Gallery choice, since
	// the 7 are part of the decklist, so a reader who asked for a list gets a list of the whole thing. What
	// distinguishes it from the main deck is the frame, the tint and the accent, not a different
	// rendering: a plain labelled strip of same-size art directly below the deck read as the deck's last
	// row. In the gallery the grid is also tighter than the main deck's own (7 across vs 5), which makes a
	// complete sideboard exactly one row wide: "is this the 7" without reading the count.
	import { resolve } from '$app/paths';
	import CardImage from '#lib/components/CardImage.svelte';
	import DeckCopyBadge from '#lib/components/deck/DeckCopyBadge.svelte';
	import { COLOR_TEXT } from '#lib/components/color.js';
	import type { Card } from '#lib/cards/schema.js';
	import { deckPrinting } from '#lib/decks/printing.js';
	import { SIDEBOARD_SIZE, type DeckEntry } from '#lib/decks/legality.js';

	let {
		entries,
		view,
		onfocus,
		cards,
		legal
	}: {
		entries: readonly DeckEntry[];
		view: 'list' | 'gallery';
		onfocus: (card: Card) => void;
		/** Copies in it, of `SIDEBOARD_SIZE`. */
		cards: number;
		legal: boolean;
	} = $props();

	// Same column track as the main deck's table, so the two line up as one decklist read top to bottom.
	const columns = 'grid-cols-[2rem_6fr_1fr_1fr_1fr]';
</script>

<div class="mt-6 rounded-lg border border-edge bg-void/50 p-3">
	<div class="mb-2.5 flex items-center justify-between gap-2 border-b border-edge/60 pb-2">
		<p class="flex items-center gap-2 text-xs font-medium tracking-wide text-bright uppercase">
			<span class="inline-block h-3.5 w-1 rounded-full bg-neon"></span>
			Sideboard
		</p>
		<span
			class="text-xs tabular-nums {legal ? 'text-neon' : 'text-muted'}"
			title="A constructed sideboard is exactly {SIDEBOARD_SIZE} cards"
		>
			{cards}/{SIDEBOARD_SIZE}
		</span>
	</div>
	{#if view === 'list'}
		<!-- No type-group headers: at 7 cards they'd outnumber the rows they label. -->
		<ul class="overflow-hidden rounded-md border border-edge/60">
			<li
				class="grid {columns} items-center gap-2 border-b border-edge/60 px-4 py-1 text-[0.65rem]
				font-medium tracking-wide text-muted uppercase"
			>
				<span></span>
				<span>Name</span>
				<span class="text-right">Cost</span>
				<span class="text-right">Pwr</span>
				<span class="text-right">RAM</span>
			</li>
			{#each entries as entry (entry.card.slug)}
				<li class="border-b border-edge/40 last:border-b-0">
					<a
						href={resolve('/cards/[slug]', { slug: entry.card.slug })}
						class="grid {columns} items-center gap-2 px-4 py-1.5 hover:bg-raised"
						onmouseenter={() => onfocus(entry.card)}
					>
						<span class="text-muted tabular-nums">{entry.quantity}×</span>
						<span class="min-w-0 truncate text-sm {COLOR_TEXT[entry.card.color]}"
							>{entry.card.name}</span
						>
						<span class="text-right text-xs text-muted tabular-nums">{entry.card.cost ?? '—'}</span>
						<span class="text-right text-xs text-muted tabular-nums">{entry.card.power ?? '—'}</span
						>
						<span class="text-right text-xs tabular-nums {COLOR_TEXT[entry.card.color]}"
							>{entry.card.ramRequired ?? '—'}</span
						>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<ul class="grid grid-cols-7 gap-2">
			{#each entries as entry (entry.card.slug)}
				{@const printing = deckPrinting(entry.card, entry.printingId)}
				<li class="relative overflow-hidden rounded-md">
					<a
						href={resolve('/cards/[slug]', { slug: entry.card.slug })}
						class="block"
						onmouseenter={() => onfocus(entry.card)}
					>
						<CardImage
							printingId={printing.id}
							thumbhash={printing.thumbhash}
							color={entry.card.color}
							alt={entry.card.name}
							sizes="110px"
						/>
					</a>
					<!-- Only past one copy: the sideboard is mostly singles. -->
					{#if entry.quantity > 1}<DeckCopyBadge quantity={entry.quantity} />{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
