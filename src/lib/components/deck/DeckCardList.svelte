<script lang="ts">
	// A deck's cards by type, as a table or as art (the List / Gallery toggle). Shared by a saved deck's
	// page and the tournament deck, so their rows, counts and ordering cannot drift apart. Pointing at a
	// card calls `onfocus`, which the page uses to show it in `DeckPreview`.
	import { resolve } from '$app/paths';
	import CardImage from '#lib/components/CardImage.svelte';
	import DeckCopyBadge from '#lib/components/deck/DeckCopyBadge.svelte';
	import { COLOR_TEXT } from '#lib/components/color.js';
	import type { Card } from '#lib/cards/schema.js';
	import type { DeckEntryGroup } from '#lib/decks/grouping.js';
	import { deckPrinting } from '#lib/decks/printing.js';

	let {
		groups,
		view,
		onfocus,
		galleryColumns = 'grid-cols-5'
	}: {
		groups: readonly DeckEntryGroup[];
		view: 'list' | 'gallery';
		onfocus: (card: Card) => void;
		/** Whole Tailwind class, so the scanner finds it: art across, in the gallery. */
		galleryColumns?: string;
	} = $props();

	const columns = 'grid-cols-[2rem_6fr_1fr_1fr_1fr]';
</script>

{#if view === 'list'}
	<ul class="rounded-md border border-edge">
		<li
			class="grid {columns} items-center gap-2 border-b border-edge px-4 py-1 text-[0.65rem]
			font-medium tracking-wide text-muted uppercase"
		>
			<span></span>
			<span>Name</span>
			<span class="text-right">Cost</span>
			<span class="text-right">Pwr</span>
			<span class="text-right">RAM</span>
		</li>
		{#each groups as group (group.cardType)}
			<li class="border-b border-edge/50 bg-raised px-4 py-1.5 text-xs tracking-wide uppercase">
				<span class="font-semibold text-bright">{group.label}</span>
				<span class="text-muted tabular-nums">({group.quantity})</span>
			</li>
			{#each group.entries as entry (entry.card.slug)}
				<li class="border-b border-edge/50 last:border-b-0">
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
		{:else}
			<li class="p-4 text-sm text-muted">No cards yet.</li>
		{/each}
	</ul>
{:else}
	<div>
		{#each groups as group (group.cardType)}
			<p
				class="mt-3 mb-1.5 rounded-md bg-raised px-3 py-1.5 text-xs tracking-wide uppercase first:mt-0"
			>
				<span class="font-semibold text-bright">{group.label}</span>
				<span class="text-muted tabular-nums">{group.quantity}</span>
			</p>
			<ul class="grid {galleryColumns} gap-2">
				{#each group.entries as entry (entry.card.slug)}
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
								sizes="150px"
							/>
						</a>
						<DeckCopyBadge quantity={entry.quantity} />
					</li>
				{/each}
			</ul>
		{:else}
			<p class="p-4 text-sm text-muted">No cards yet.</p>
		{/each}
	</div>
{/if}
