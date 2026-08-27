<script lang="ts">
	/**
	 * The public deck explorer — `docs/spec/deckbuilder.md` §9. Its own route, reachable signed
	 * out; "My Decks" lives at `/decks` instead, one level up in the "Decks" nav dropdown, not a
	 * peer tab here — see `+page.server.ts` for why.
	 *
	 * The left nav is one `tab` param — Hot/Newest/Most-liked plus, below a divider, Starter Decks
	 * — the "eventually filters" this doc comment used to only promise is now here. One param
	 * rather than a separate sort + starter-filter pair: they're mutually exclusive tabs, not
	 * independent axes, so two params could disagree with each other (e.g. `sort=hot&starter=1`,
	 * which sort silently ignores) in a way one param structurally can't. Decided via
	 * `.scratch/starter-decks/map.md`: Starter Decks stay in the regular list (matching Moxfield's
	 * Commander-precon model) rather than a walled-off section; its own tab has a fixed
	 * newest-first order, unrelated to whichever of the other three was last selected.
	 *
	 * Like counts here are read-only. Liking only happens from a deck's own view page
	 * (`/decks/[id]`), and only for non-owners — this list is browsing, not the like surface.
	 */
	import { page } from '$app/state';
	import CardImage from '#lib/components/CardImage.svelte';
	import { cardBySlug } from '#lib/decks/deck-state.svelte.js';
	import {
		deckSizeStatus,
		LEGEND_SLOTS,
		MAX_DECK_SIZE,
		MIN_DECK_SIZE
	} from '#lib/decks/legality.js';
	import { cookieState } from '#lib/cookie-state.svelte.js';
	import Meta from '#lib/components/Meta.svelte';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';

	let { data } = $props();

	// Shared with /decks — "how I like browsing a list of decks" is one preference, not two.
	// Server-rendered from a cookie (`data.deckView`, read in `+page.server.ts`) rather than
	// `localStorage`: this page isn't prerendered, so the server can pick the right branch on
	// the very first render — no flash, and no need to render the other one just in case.
	// svelte-ignore state_referenced_locally
	const deckView = cookieState('decks-list-view', data.deckView);

	// Grid cards always render this many art slots, even for missing Legends — otherwise a
	// deck with fewer than 3 Legends gets a shorter art strip, and every card in the grid ends
	// up a different height.
	const legendSlots = Array.from({ length: LEGEND_SLOTS }, (_, index) => index);

	const SORTS = [
		{ value: 'hot', label: 'Hot' },
		{ value: 'newest', label: 'Newest' },
		{ value: 'most-liked', label: 'Most-liked' }
	] as const;

	function withParam(key: string, value: string | null) {
		const url = new URL(page.url.href);
		if (value === null) url.searchParams.delete(key);
		else url.searchParams.set(key, value);
		return `${url.pathname}?${url.searchParams.toString()}`;
	}

	function tabHref(tab: string) {
		return withParam('tab', tab);
	}
</script>

{#snippet likeBadge(likeCount: number)}
	<span class="flex items-center gap-1">
		<svg viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5">
			<path
				d="M10 17s-6.5-4.03-6.5-8.5A3.5 3.5 0 0 1 10 6.5a3.5 3.5 0 0 1 6.5 2c0 4.47-6.5 8.5-6.5 8.5Z"
			/>
		</svg>
		{likeCount}
	</span>
{/snippet}

{#snippet starterBadge(deck: { isStarterDeck: boolean })}
	{#if deck.isStarterDeck}
		<span
			class="rounded-full bg-neon/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide
				text-neon uppercase"
		>
			Starter
		</span>
	{/if}
{/snippet}

<Meta
	title="Explore decks — novastack"
	description="Browse public decks from the novastack community."
	origin={data.origin}
	path="/explore"
/>

<!-- The extra plain wrapper matters: `<main>` (root layout) is a column flex container, and a
     `mx-auto max-w-…` box that is a *direct* flex child has its stretch behavior disabled by its
     own auto margins — it shrink-wraps to content width instead of filling to `max-w`, which is
     exactly what made switching List/Grid visibly resize the page. See `/decks/[id]` and
     `/cards` for the same fix. -->
<div>
	<div class="mx-auto max-w-5xl p-6">
		<h1 class="mb-6 text-xl font-semibold text-bright">Explore decks</h1>
		<div class="flex gap-6">
			<nav class="w-36 shrink-0">
				<ul class="flex flex-col gap-1 text-sm">
					{#each SORTS as { value, label } (value)}
						<li>
							<a
								href={tabHref(value)}
								class="block rounded-md px-3 py-1.5"
								class:bg-raised={data.tab === value}
								class:text-bright={data.tab === value}
								class:text-muted={data.tab !== value}>{label}</a
							>
						</li>
					{/each}
				</ul>
				<div class="my-3 border-t border-edge/60"></div>
				<ul class="flex flex-col gap-1 text-sm">
					<li>
						<a
							href={tabHref('starter')}
							class="block rounded-md px-3 py-1.5"
							class:bg-raised={data.tab === 'starter'}
							class:text-bright={data.tab === 'starter'}
							class:text-muted={data.tab !== 'starter'}>Starter Decks</a
						>
					</li>
				</ul>
			</nav>

			<div class="min-w-0 flex-1">
				<div class="mb-4 flex items-center gap-4">
					<div class="min-w-0 flex-1">
						{#if data.ownerId}
							<span class="text-sm text-muted">
								Showing public decks by <span class="text-bright">{data.ownerName}</span>
								<a href={withParam('owner', null)} class="text-neon hover:text-neon-dim">Clear</a>
							</span>
						{/if}
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
					<p class="text-sm text-muted">No public decks yet.</p>
				{:else if deckView.value === 'grid'}
					<ul class="grid grid-cols-2 gap-4">
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
									<div class="flex items-center gap-1.5">
										{@render starterBadge(deck)}
										<a
											href="/decks/{deck.id}"
											class="block truncate text-base font-semibold text-bright hover:text-neon"
											>{deck.name}</a
										>
									</div>
									<p class="mt-1 text-xs text-muted tabular-nums">
										<span
											class={SIZE_STATUS_TONE[deckSizeStatus(deck.cardCount)]}
											title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards">{deck.cardCount}</span
										>
										cards · {deck.createdAt.toLocaleDateString()}
									</p>
									<div class="mt-2 flex items-center justify-between text-xs text-muted">
										<a href="/explore?owner={deck.ownerId}" class="hover:text-neon"
											>by {deck.ownerName}</a
										>
										{@render likeBadge(deck.likeCount)}
									</div>
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
									<div class="flex items-center gap-1.5">
										{@render starterBadge(deck)}
										<p class="truncate text-lg font-semibold text-bright hover:text-neon">
											{deck.name}
										</p>
									</div>
									<p class="mt-1 text-sm text-muted tabular-nums">
										<span
											class={SIZE_STATUS_TONE[deckSizeStatus(deck.cardCount)]}
											title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards">{deck.cardCount}</span
										>
										cards · {deck.createdAt.toLocaleDateString()}
									</p>
								</a>
								<div class="flex shrink-0 items-center gap-3 text-sm text-muted">
									<a href="/explore?owner={deck.ownerId}" class="hover:text-neon"
										>by {deck.ownerName}</a
									>
									{@render likeBadge(deck.likeCount)}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>
</div>
