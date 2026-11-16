<script lang="ts">
	// Standings: the results table is the page. Every row opens in place to the deck behind it.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import TournamentDeck from '#lib/components/tournaments/TournamentDeck.svelte';
	import { legendNames } from '#lib/tournaments/present.js';

	let { data } = $props();
	const standings = $derived(data.event.standings);
</script>

<div
	class="grid grid-cols-[2.5rem_1fr_5.5rem_3rem] gap-x-3 px-3 font-mono text-[11px] tracking-wide text-muted uppercase"
	aria-hidden="true"
>
	<span>#</span><span>Player / Legends</span><span class="text-right">W-L-D</span><span
		class="text-right">Pts</span
	>
</div>

<ol class="mt-1 space-y-1">
	{#each standings as standing (standing.playerId)}
		<li>
			<details
				class="rounded-lg border border-transparent open:border-edge open:bg-shell hover:bg-surface"
			>
				<summary
					class="grid cursor-pointer list-none grid-cols-[2.5rem_1fr_5.5rem_3rem] items-center gap-x-3 px-3 py-2 [&::-webkit-details-marker]:hidden"
				>
					<span class="font-mono text-sm {standing.rank <= 3 ? 'text-neon' : 'text-muted'}">
						{standing.rank}
					</span>
					<span class="flex min-w-0 items-center gap-3">
						<span class="flex shrink-0 -space-x-2">
							{#if standing.deck}
								{#each standing.deck.legends as slug (slug)}
									<LegendArt {slug} sizes="48px" class="w-7 ring-1 ring-void" />
								{/each}
							{:else}
								<span class="card-frame w-7 rounded border border-dashed border-edge"></span>
							{/if}
						</span>
						<span class="min-w-0">
							<span class="block truncate text-bright">{standing.name}</span>
							<span class="block truncate text-[11px] text-muted">
								{standing.deck ? legendNames(standing.deck.legends) : 'no deck registered'}
							</span>
						</span>
					</span>
					<span class="text-right font-mono text-sm">
						{standing.wins}-{standing.losses}-{standing.draws}
					</span>
					<span class="text-right font-mono text-sm text-muted">{standing.points}</span>
				</summary>
				{#if standing.deck}
					<div class="border-t border-edge/60 px-4 py-4">
						<TournamentDeck deck={standing.deck} />
					</div>
				{/if}
			</details>
		</li>
	{/each}
</ol>
