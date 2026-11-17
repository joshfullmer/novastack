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
	import type { DeckView } from '#lib/decks/view.js';
	import { deckPrinting } from '#lib/decks/printing.js';

	let {
		groups,
		view,
		onfocus,
		galleryColumns = 'grid-cols-5'
	}: {
		groups: readonly DeckEntryGroup[];
		view: DeckView;
		onfocus: (card: Card) => void;
		/** Whole Tailwind class, so the scanner finds it: art across, in the gallery. */
		galleryColumns?: string;
	} = $props();

	const columns = 'grid-cols-[2rem_6fr_1fr_1fr_1fr]';

	// How far each copy behind the front one is lowered, as a share of a card's height; and what that
	// is as a share of a card's width (a card is 1024 tall to 733 wide), which is what the pile's own
	// padding is measured against.
	const FAN = 15;
	const FAN_WIDTH = Math.round((FAN * 1024) / 733);
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
{:else if view === 'stacks'}
	<!-- Piles, as on a table: each card once, its copies fanned down behind it so only their bottom edges
	     show (where a card prints its name). A pile of three reads as three before anything is counted. -->
	<div>
		{#each groups as group (group.cardType)}
			<p
				class="mt-3 mb-1.5 rounded-md bg-raised px-3 py-1.5 text-xs tracking-wide uppercase first:mt-0"
			>
				<span class="font-semibold text-bright">{group.label}</span>
				<span class="text-muted tabular-nums">{group.quantity}</span>
			</p>
			<ul class="grid {galleryColumns} gap-x-2 gap-y-3">
				{#each group.entries as entry (entry.card.slug)}
					{@const printing = deckPrinting(entry.card, entry.printingId)}
					<li>
						<a
							href={resolve('/cards/[slug]', { slug: entry.card.slug })}
							class="relative block"
							title="{entry.quantity}× {entry.card.name}"
							style:padding-bottom="{(entry.quantity - 1) * FAN_WIDTH}%"
							onmouseenter={() => onfocus(entry.card)}
						>
							{#each Array.from({ length: entry.quantity }, (_, copy) => copy) as copy (copy)}
								<span
									class="block {copy === 0 ? 'relative' : 'absolute inset-x-0 top-0'}
									overflow-hidden rounded-md"
									style:transform="translateY({copy * FAN}%)"
									style:z-index={entry.quantity - copy}
								>
									<CardImage
										printingId={printing.id}
										thumbhash={printing.thumbhash}
										color={entry.card.color}
										alt={copy === 0 ? entry.card.name : ''}
										sizes="150px"
									/>
								</span>
							{/each}
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="p-4 text-sm text-muted">No cards yet.</p>
		{/each}
	</div>
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
