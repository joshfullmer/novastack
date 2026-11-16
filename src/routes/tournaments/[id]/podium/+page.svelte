<script lang="ts">
	// Podium: the top of the bracket gets the room. The top three as art-led panels with their lists,
	// fourth to eighth as tiles, everyone else as chips.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import TournamentDeck from '#lib/components/tournaments/TournamentDeck.svelte';
	import { legendNames } from '#lib/tournaments/present.js';

	let { data } = $props();
	const standings = $derived(data.event.standings);
	const podium = $derived(standings.slice(0, 3));
	const topEight = $derived(standings.slice(3, 8));
	const field = $derived(standings.slice(8));
	const MEDAL = ['text-card-yellow', 'text-body', 'text-card-red'];
</script>

<section class="grid gap-4 lg:grid-cols-3" aria-label="Podium">
	{#each podium as standing, i (standing.playerId)}
		<article class="overflow-hidden rounded-2xl border border-edge bg-shell">
			<div class="flex gap-1 bg-surface p-3">
				{#if standing.deck}
					{#each standing.deck.legends as slug (slug)}
						<LegendArt {slug} sizes="180px" class="flex-1 shadow-lg" />
					{/each}
				{:else}
					<div class="flex h-40 flex-1 items-center justify-center text-xs text-muted">
						no deck registered
					</div>
				{/if}
			</div>
			<div class="p-4">
				<div class="flex items-baseline justify-between">
					<h2 class="text-lg font-semibold text-bright">
						<span class="font-mono {MEDAL[i]}">{standing.rank}</span>
						{standing.name}
					</h2>
					<span class="font-mono text-sm text-muted">
						{standing.wins}-{standing.losses}-{standing.draws}
					</span>
				</div>
				<p class="mb-3 text-xs text-muted">
					{standing.deck ? legendNames(standing.deck.legends) : ''}
				</p>
				{#if standing.deck}
					<details>
						<summary class="cursor-pointer font-mono text-xs text-neon">decklist</summary>
						<div class="mt-3"><TournamentDeck deck={standing.deck} columns={1} /></div>
					</details>
				{/if}
			</div>
		</article>
	{/each}
</section>

{#if topEight.length > 0}
	<section class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Top eight">
		{#each topEight as standing (standing.playerId)}
			<article class="flex items-center gap-3 rounded-xl border border-edge bg-shell p-3">
				<span class="font-mono text-lg text-muted">{standing.rank}</span>
				<span class="flex -space-x-2">
					{#each standing.deck?.legends ?? [] as slug (slug)}
						<LegendArt {slug} sizes="48px" class="w-8 ring-1 ring-void" />
					{/each}
				</span>
				<span class="min-w-0">
					<span class="block truncate text-sm text-bright">{standing.name}</span>
					<span class="font-mono text-[11px] text-muted">
						{standing.wins}-{standing.losses}-{standing.draws}
					</span>
				</span>
			</article>
		{/each}
	</section>
{/if}

{#if field.length > 0}
	<section class="mt-6">
		<h2 class="mb-2 font-mono text-[11px] tracking-wide text-muted uppercase">
			The rest of the field
		</h2>
		<ul class="flex flex-wrap gap-2">
			{#each field as standing (standing.playerId)}
				<li class="rounded-full border border-edge px-3 py-1 text-xs">
					<span class="font-mono text-muted">{standing.rank}</span>
					{standing.name}
					<span class="font-mono text-muted">
						{standing.wins}-{standing.losses}-{standing.draws}
					</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}
