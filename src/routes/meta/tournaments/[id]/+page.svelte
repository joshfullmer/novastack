<script lang="ts">
	// Standings: the results table is the page. A player's row opens their deck, the way the decks list does:
	// on a wide screen in the pane beside the standings (`?deck=`, so a link keeps it), otherwise on the
	// deck's own page.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { cn } from '#lib/cn.js';
	import DeckPane from '#lib/components/tournaments/DeckPane.svelte';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { opensInPane } from '#lib/tournaments/pane.js';
	import { legendNames } from '#lib/tournaments/present.js';
	import { withParams } from '#lib/tournaments/url.js';

	let { data } = $props();
	const standings = $derived(data.event.standings);

	function open(event: MouseEvent, guid: string) {
		if (!opensInPane(event)) return;
		event.preventDefault();
		void goto(withParams(page.url, { deck: guid }), { reset: false });
	}

	/** Four columns from `md`; on a phone the points fold under the record so the name gets the room. */
	const COLUMNS =
		'grid-cols-[1.75rem_minmax(0,1fr)_3.5rem] gap-x-2 md:grid-cols-[2.5rem_1fr_5.5rem_3rem] md:gap-x-3';
	const ROW = `grid ${COLUMNS} items-center rounded-lg px-2 py-2 max-2xl:px-3`;
</script>

{#snippet row(standing: (typeof standings)[number])}
	<span class="font-mono text-sm {standing.rank <= 3 ? 'text-neon' : 'text-muted'}">
		{standing.rank}
	</span>
	<span class="flex min-w-0 items-center gap-2 md:gap-3">
		<span class="flex shrink-0 -space-x-2">
			{#if standing.deck}
				{#each standing.deck.legends as slug (slug)}
					<LegendArt {slug} sizes="48px" class="w-6 ring-1 ring-void md:w-7" />
				{/each}
			{:else}
				<span class="card-frame w-7 rounded border border-dashed border-edge"></span>
			{/if}
		</span>
		<span class="min-w-0">
			<span class="block truncate text-bright">{standing.name}</span>
			<span class="block truncate text-[11px] text-muted">
				{#if standing.deck}
					{#if standing.deck.ram}<RamCode
							ram={standing.deck.ram}
							class="mr-1.5"
						/>{/if}{legendNames(standing.deck.legends)}
				{:else}
					no deck registered
				{/if}
			</span>
		</span>
	</span>
	<span class="text-right font-mono text-sm">
		{standing.wins}-{standing.losses}-{standing.draws}
		<span class="block text-[11px] text-muted md:hidden">{standing.points} pts</span>
	</span>
	<span class="hidden text-right font-mono text-sm text-muted md:block">{standing.points}</span>
{/snippet}

<!-- On a wide screen the page is the height of the screen and the standings and the deck each scroll on
     their own, as on the decks list. Narrower, it is an ordinary page. -->
<div
	class="grid min-h-0 flex-1 gap-6 2xl:grid-cols-[28rem_minmax(0,1fr)] 2xl:grid-rows-[minmax(0,1fr)]"
>
	<div class="min-w-0 2xl:flex 2xl:min-h-0 2xl:flex-col">
		<div
			class="grid shrink-0 {COLUMNS} px-2 font-mono text-[11px] tracking-wide text-muted uppercase max-2xl:px-3"
			aria-hidden="true"
		>
			<span>#</span><span>Player / Legends</span><span class="text-right">W-L-D</span><span
				class="hidden text-right md:block">Pts</span
			>
		</div>

		<div class="mt-1 2xl:min-h-0 2xl:flex-1 2xl:overflow-y-auto">
			<ol class="space-y-0.5">
				{#each standings as standing (standing.playerId)}
					<li>
						{#if standing.deck}
							{@const guid = standing.deck.guid}
							<a
								href="/meta/decks/{guid}"
								onclick={(event) => open(event, guid)}
								aria-current={guid === data.deck?.guid ? 'true' : undefined}
								class={cn(
									ROW,
									'hover:bg-surface',
									guid === data.deck?.guid && 'bg-surface ring-1 ring-neon/60'
								)}
							>
								{@render row(standing)}
							</a>
						{:else}
							<div class={cn(ROW, 'opacity-70')}>{@render row(standing)}</div>
						{/if}
					</li>
				{/each}
			</ol>
		</div>
	</div>

	<DeckPane
		deck={data.deck}
		view={data.deckView}
		ownPage={data.deck ? `/meta/decks/${data.deck.guid}` : ''}
		close={withParams(page.url, { deck: null })}
		hrefFor={(guid) => `/meta/decks/${guid}`}
		onopen={open}
	/>
</div>
