<script lang="ts">
	// One Tournament Deck: who played it and how it did, its path through the event (every round, the
	// opponent's Legends and the result), and the list. The full deck page and the pane beside the deck
	// list both show this, so they cannot drift apart. `pane` fits half a screen; `page` the whole of
	// one. A round against an opponent who has a list opens that list (`hrefFor`, and `onopen` for a
	// click a page wants to handle itself, as the deck list's pane does).
	import { cn } from '#lib/cn.js';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import TournamentDeckView from '#lib/components/tournaments/TournamentDeckView.svelte';
	import { formatDate, legendNames } from '#lib/tournaments/present.js';
	import type { DeckDetail, PathRow } from '#lib/tournaments/deck-views.js';

	let {
		deck,
		view,
		layout = 'page',
		hrefFor,
		onopen
	}: {
		deck: DeckDetail;
		/** The visitor's List / Gallery choice (a cookie, read on the server). */
		view: 'list' | 'gallery';
		layout?: 'page' | 'pane';
		/** Where an opponent's deck is. */
		hrefFor: (guid: string) => string;
		onopen?: (event: MouseEvent, guid: string) => void;
	} = $props();

	const MARK = {
		W: cn('text-card-green'),
		L: cn('text-card-red'),
		D: cn('text-card-yellow'),
		BYE: cn('text-muted')
	};
</script>

{#snippet stepRow(step: PathRow)}
	<span class="w-5 font-mono text-xs text-muted">{step.round}</span>
	<span class="w-8 font-mono font-semibold {MARK[step.result]}">{step.result}</span>
	<span class="flex -space-x-1.5">
		{#each step.oppLegends as slug (slug)}
			<LegendArt {slug} sizes="32px" class="w-5 ring-1 ring-void" />
		{/each}
	</span>
	<span class="min-w-0 flex-1 truncate">{step.opponent ?? 'bye'}</span>
	<span class="font-mono text-xs text-muted">{step.score}</span>
{/snippet}

<!-- On a page of its own the path sits beside the header, not under it: a row of the path is short. -->
<div
	class={layout === 'page' ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start' : ''}
>
	<header class="flex flex-wrap items-center gap-6 border-b border-edge pb-5">
		<div class="flex {layout === 'pane' ? 'w-48' : 'w-64'} gap-1">
			{#each deck.legends as slug (slug)}<LegendArt
					{slug}
					sizes="120px"
					class="flex-1 shadow-lg"
				/>{/each}
		</div>
		<div class="min-w-0">
			<h1 class="text-2xl font-semibold text-bright">{deck.player}</h1>
			<p class="text-sm text-muted">
				{#if deck.ram}
					<a
						href="/cards?q=legends:{deck.ram}"
						class="mr-1 text-base hover:underline"
						title="The cards this deck's Legends allow"><RamCode ram={deck.ram} /></a
					>
				{/if}{legendNames(deck.legends)}
			</p>
			<p class="mt-1 font-mono text-xs text-muted">
				Finished {deck.rank} of {deck.playerCount} · {deck.wins}-{deck.losses}-{deck.draws} ·
				<a href="/tournaments/{deck.eventId}" class="text-neon hover:underline">{deck.eventName}</a>
				· {formatDate(deck.startsAt)}
			</p>
		</div>
	</header>

	<section class={layout === 'page' ? 'mt-5 lg:mt-0' : 'mt-5'} aria-labelledby="path-{deck.guid}">
		<h2 id="path-{deck.guid}" class="mb-2 font-mono text-[11px] tracking-wide text-muted uppercase">
			Path through the event
		</h2>
		<ol class="space-y-0.5">
			{#each deck.path as step (step.round)}
				<li>
					{#if step.oppDeck}
						{@const guid = step.oppDeck}
						<a
							href={hrefFor(guid)}
							onclick={(event) => onopen?.(event, guid)}
							class="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface"
						>
							{@render stepRow(step)}
						</a>
					{:else}
						<div class="flex items-center gap-2 px-1.5 py-1 text-sm">{@render stepRow(step)}</div>
					{/if}
				</li>
			{:else}
				<li class="text-sm text-muted">No matches recorded.</li>
			{/each}
		</ol>
	</section>
</div>

<section class="mt-6" aria-label="Decklist">
	<TournamentDeckView {deck} {view} {layout} />
</section>
