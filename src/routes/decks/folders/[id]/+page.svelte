<script lang="ts">
	/** The read-only, shareable view of one folder — `.scratch/decklist-folders/map.md`. Mirrors
	 * `/explore`'s List/Grid deck rendering (no shared component exists there either — see
	 * `/explore/+page.svelte`'s own doc comment), minus like counts and the Starter badge, since
	 * this isn't the browse surface. */
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import { cardBySlug } from '#lib/decks/deck-state.svelte.js';
	import {
		deckSizeStatus,
		LEGEND_SLOTS,
		MAX_DECK_SIZE,
		MIN_DECK_SIZE
	} from '#lib/decks/legality.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';
	import { cookieState } from '#lib/cookie-state.svelte.js';

	let { data } = $props();

	const legendSlots = Array.from({ length: LEGEND_SLOTS }, (_, index) => index);

	// Shared with /decks and /explore — "how I like browsing a list of decks" is one preference.
	// svelte-ignore state_referenced_locally
	const deckView = cookieState('decks-list-view', data.deckView);
</script>

<Meta
	title="{data.folder.name} — novastack"
	description="A folder of Cyberpunk TCG decks by {data.folder.ownerName}."
	origin={data.origin}
	path="/decks/folders/{data.folder.id}"
/>

<div>
	<div class="mx-auto max-w-5xl p-6">
		<div class="mb-6 flex items-center justify-between gap-4">
			<div>
				<h1 class="text-xl font-semibold text-bright">📁 {data.folder.name}</h1>
				<p class="text-sm text-muted">by {data.folder.ownerName}</p>
			</div>
			<div class="flex overflow-hidden rounded-md border border-edge text-xs">
				<button
					type="button"
					onclick={() => (deckView.value = 'list')}
					class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
					class:bg-raised={deckView.value === 'list'}
					class:text-bright={deckView.value === 'list'}
					class:text-muted={deckView.value !== 'list'}>List</button
				>
				<button
					type="button"
					onclick={() => (deckView.value = 'grid')}
					class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
					class:bg-raised={deckView.value === 'grid'}
					class:text-bright={deckView.value === 'grid'}
					class:text-muted={deckView.value !== 'grid'}>Grid</button
				>
			</div>
		</div>

		{#if data.decks.length === 0}
			<p class="text-sm text-muted">No decks to show.</p>
		{:else if deckView.value === 'grid'}
			<ul class="grid grid-cols-2 gap-4 lg:grid-cols-3">
				{#each data.decks as deck (deck.id)}
					<li class="overflow-hidden rounded-lg border border-edge bg-shell">
						<a href="/decks/{deck.id}" class="flex gap-1 bg-void p-2">
							{#each legendSlots as slot (slot)}
								{@const slug = deck.legendSlugs[slot]}
								{@const legend = slug ? cardBySlug(slug) : null}
								{#if legend}
									<div class="card-frame flex-1 overflow-hidden rounded">
										<CardImage
											printingId={legend.printings[0].id}
											thumbhash={legend.printings[0].thumbhash}
											color={legend.color}
											alt={legend.name}
											sizes="200px"
										/>
									</div>
								{:else}
									<div
										class="flex card-frame flex-1 items-center justify-center rounded border
										border-edge bg-surface text-muted"
									>
										—
									</div>
								{/if}
							{/each}
						</a>
						<div class="p-3">
							<a
								href="/decks/{deck.id}"
								class="block truncate text-base font-semibold text-bright hover:text-neon"
								>{deck.name}</a
							>
							<p class="mt-1 text-xs text-muted tabular-nums">
								<span
									class={SIZE_STATUS_TONE[deckSizeStatus(deck.cardCount)]}
									title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards">{deck.cardCount}</span
								>
								cards
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each data.decks as deck (deck.id)}
					<li class="flex items-center gap-4 rounded-lg border border-edge bg-shell p-4">
						<div class="flex shrink-0 gap-2">
							{#each legendSlots as slot (slot)}
								{@const slug = deck.legendSlugs[slot]}
								{@const legend = slug ? cardBySlug(slug) : null}
								{#if legend}
									<div class="size-20 overflow-hidden rounded-md border border-edge">
										<CardImage
											printingId={legend.printings[0].id}
											thumbhash={legend.printings[0].thumbhash}
											color={legend.color}
											alt={legend.name}
											sizes="80px"
										/>
									</div>
								{:else}
									<div
										class="flex size-20 items-center justify-center rounded-md border
											border-edge bg-surface text-muted"
									>
										—
									</div>
								{/if}
							{/each}
						</div>
						<a href="/decks/{deck.id}" class="min-w-0 flex-1">
							<p class="truncate text-lg font-semibold text-bright hover:text-neon">
								{deck.name}
							</p>
							<p class="mt-1 text-sm text-muted tabular-nums">
								<span
									class={SIZE_STATUS_TONE[deckSizeStatus(deck.cardCount)]}
									title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards">{deck.cardCount}</span
								>
								cards
							</p>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
