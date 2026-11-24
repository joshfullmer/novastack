<script lang="ts">
	// One Tournament Deck: who played it and how it did, its path through the event (every round, the
	// opponent and the result), and the list. The full deck page and the pane beside the deck list both
	// show this, so they cannot drift apart. `page` has the room to put the path beside the header; `pane`
	// is half a screen, so the path goes down the narrow rail beside the cards and the cards start high.
	// A round against an opponent who has a list opens that list (`hrefFor`, and `onopen` for a click a
	// page wants to handle itself, as the deck list's pane does).
	import { cn } from '#lib/cn.js';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import TournamentDeckView from '#lib/components/tournaments/TournamentDeckView.svelte';
	import { formatDate, legendNames } from '#lib/tournaments/present.js';
	import type { DeckView } from '#lib/decks/view.js';
	import type { DeckDetail, PathRow } from '#lib/tournaments/deck-views.js';

	let {
		deck,
		view,
		layout = 'page',
		hrefFor,
		onopen
	}: {
		deck: DeckDetail;
		/** The visitor's choice of view (a cookie, read on the server). */
		view: DeckView;
		layout?: 'page' | 'pane';
		/** Where an opponent's deck is. */
		hrefFor: (guid: string) => string;
		onopen?: (event: MouseEvent, guid: string) => void;
	} = $props();

	const compact = $derived(layout === 'pane');

	// The Legend being pointed at in the header: the big card preview shows it while the pointer is there.
	let pointed = $state<string | null>(null);

	const MARK = {
		W: cn('text-card-green'),
		L: cn('text-card-red'),
		D: cn('text-card-yellow'),
		BYE: cn('text-muted')
	};
</script>

{#snippet stepRow(step: PathRow)}
	<span class="w-4 font-mono text-xs text-muted">{step.round}</span>
	<span class="w-6 font-mono font-semibold {MARK[step.result]}">{step.result}</span>
	<!-- The rail is narrow: the opponent's name says who it was; on a page there is room for their art too. -->
	{#if !compact}
		<span class="flex -space-x-1.5">
			{#each step.oppLegends as slug (slug)}
				<LegendArt {slug} sizes="32px" class="w-5 ring-1 ring-void" />
			{/each}
		</span>
	{/if}
	<span class="min-w-0 flex-1 truncate">{step.opponent ?? 'bye'}</span>
	<span class="font-mono text-xs text-muted">{step.score}</span>
{/snippet}

{#snippet path()}
	<section aria-labelledby="path-{deck.guid}">
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
{/snippet}

<!-- In the deck list's pane (wide), this fills the pane's height and the cards and the rail scroll inside
     it. On a page of its own the path sits beside the header, not under it: a row of the path is short. -->
<div class={compact ? '2xl:flex 2xl:min-h-0 2xl:flex-1 2xl:flex-col' : ''}>
	<div
		class={layout === 'page'
			? 'grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start'
			: ''}
	>
		<!-- The art sits above the name on a phone: beside it, 256px of art leaves the name ~80px and the
		     whole page is pushed wider than the screen. -->
		<header
			class="flex min-w-0 flex-col items-start gap-3 border-b border-edge pb-4 sm:flex-row sm:items-center sm:gap-4"
		>
			<div class="flex {compact ? 'w-32' : 'w-56 sm:w-64'} shrink-0 gap-1">
				{#each deck.legends as slug (slug)}
					<span
						class="flex-1"
						role="presentation"
						onpointerenter={() => (pointed = slug)}
						onpointerleave={() => (pointed = null)}
					>
						<LegendArt {slug} sizes="120px" class="w-full shadow-lg" />
					</span>
				{/each}
			</div>
			<div class="min-w-0">
				<h1
					class="break-words {compact
						? 'text-xl'
						: 'text-2xl'} font-semibold text-bright sm:truncate"
				>
					{deck.player}
				</h1>
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
					<a href="/meta/tournaments/{deck.eventId}" class="text-neon hover:underline"
						>{deck.eventName}</a
					>
					· {formatDate(deck.startsAt)}
				</p>
			</div>
		</header>

		{#if layout === 'page'}
			<div class="mt-5 lg:mt-0">{@render path()}</div>
		{/if}
	</div>

	<section class="mt-5 {compact ? '2xl:min-h-0 2xl:flex-1' : ''}" aria-label="Decklist">
		<TournamentDeckView
			{deck}
			{view}
			{layout}
			{pointed}
			rail={layout === 'pane' ? path : undefined}
		/>
	</section>
</div>
