<script lang="ts">
	/**
	 * The public deck explorer — `docs/spec/deckbuilder.md` §9. Its own route, reachable signed
	 * out; "My Decks" lives at `/decks` instead, one level up in the "Decks" nav dropdown, not a
	 * peer tab here — see `+page.server.ts` for why.
	 *
	 * Like counts here are read-only. Liking only happens from a deck's own view page
	 * (`/decks/[id]`), and only for non-owners — this list is browsing, not the like surface.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { cardBySlug } from '#lib/decks/deck-state.svelte.js';
	import { deckSizeStatus, MAX_DECK_SIZE, MIN_DECK_SIZE } from '#lib/decks/legality.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';

	let { data } = $props();

	const SORTS = [
		{ value: 'hot', label: 'Hot' },
		{ value: 'newest', label: 'Newest' },
		{ value: 'most-liked', label: 'Most-liked' }
	] as const;

	function sortHref(sort: string) {
		return data.ownerId ? `/explore?sort=${sort}&owner=${data.ownerId}` : `/explore?sort=${sort}`;
	}
</script>

<svelte:head>
	<title>Explore decks — novastack</title>
</svelte:head>

<div class="mx-auto max-w-3xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-xl font-semibold text-bright">Explore decks</h1>
		<div class="flex overflow-hidden rounded-md border border-edge text-xs">
			{#each SORTS as { value, label } (value)}
				<a
					href={sortHref(value)}
					class="px-2 py-1"
					class:bg-raised={data.sort === value}
					class:text-bright={data.sort === value}
					class:text-muted={data.sort !== value}>{label}</a
				>
			{/each}
		</div>
	</div>

	{#if data.ownerId}
		<div class="mb-4 flex items-center gap-2 text-sm text-muted">
			<span>Showing public decks by <span class="text-bright">{data.ownerName}</span></span>
			<a href="/explore?sort={data.sort}" class="text-neon hover:text-neon-dim">Clear</a>
		</div>
	{/if}

	{#if data.decks.length === 0}
		<p class="text-sm text-muted">No public decks yet.</p>
	{:else}
		<ul class="divide-y divide-edge">
			{#each data.decks as deck (deck.id)}
				<li class="flex items-center gap-4 rounded-md px-2 py-3 hover:bg-raised">
					<a href="/decks/{deck.id}" class="flex min-w-0 flex-1 items-center gap-4">
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
								<span
									class={SIZE_STATUS_TONE[deckSizeStatus(deck.cardCount)]}
									title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards">{deck.cardCount}</span
								>
								cards · {deck.createdAt.toLocaleDateString()}
							</p>
						</div>
					</a>

					<a
						href="/explore?owner={deck.ownerId}"
						class="shrink-0 text-xs text-muted hover:text-neon"
					>
						by {deck.ownerName}
					</a>

					<span class="flex shrink-0 items-center gap-1 px-2 py-1.5 text-sm text-muted">
						<svg
							viewBox="0 0 20 20"
							class="size-4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								d="M10 17s-6.5-4.03-6.5-8.5A3.5 3.5 0 0 1 10 6.5a3.5 3.5 0 0 1 6.5 2c0 4.47-6.5 8.5-6.5 8.5Z"
							/>
						</svg>
						{deck.likeCount}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
