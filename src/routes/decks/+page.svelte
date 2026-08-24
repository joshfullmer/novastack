<script lang="ts">
	/**
	 * "My Decks" — `docs/spec/deckbuilder.md` §8, minimal Phase-1 cut: browse and open-to-edit
	 * only. Row operations (rename/duplicate/delete/visibility) and the Explore tab are Phase 2.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { cardBySlug } from '#lib/decks/deck-state.svelte.js';
	import { MAX_DECK_SIZE, MIN_DECK_SIZE } from '#lib/decks/legality.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>My decks — novastack</title>
</svelte:head>

<div class="mx-auto max-w-3xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-xl font-semibold text-bright">My decks</h1>
		<form method="POST" action="/decks/new">
			<button
				type="submit"
				class="rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void hover:bg-neon-dim"
			>
				+ New deck
			</button>
		</form>
	</div>

	{#if data.decks.length === 0}
		<p class="text-sm text-muted">No decks yet — create one to get started.</p>
	{:else}
		<ul class="divide-y divide-edge">
			{#each data.decks as deck (deck.id)}
				<li>
					<a
						href="/decks/{deck.id}"
						class="-mx-2 flex items-center gap-4 rounded-md px-2 py-3 hover:bg-raised"
					>
						<div class="flex shrink-0 gap-1">
							{#each deck.legendSlugs as slug (slug)}
								{@const legend = cardBySlug(slug)}
								{#if legend}
									<div class="size-10 overflow-hidden rounded border border-edge">
										<CardImage
											printingId={legend.printings[0].id}
											thumbhash={legend.printings[0].thumbhash}
											color={legend.color}
											alt={legend.name}
											sizes="40px"
										/>
									</div>
								{/if}
							{/each}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-bright">{deck.name}</p>
							<p class="text-xs text-muted tabular-nums">
								{deck.cardCount} / {MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards
								{#if deck.savedAt}
									· saved {deck.savedAt.toLocaleDateString()}
								{/if}
							</p>
						</div>
						<span
							class="shrink-0 rounded-full border border-edge px-2 py-0.5 text-xs text-muted capitalize"
						>
							{deck.visibility}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
