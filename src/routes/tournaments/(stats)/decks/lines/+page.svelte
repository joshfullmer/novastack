<script lang="ts">
	// The same decks as shelves, one per Legend line: its art and record on the left, every deck that ran
	// it as a tile, the best-placed few. Reads like browsing a collection rather than querying a table. A win rate appears
	// only from 5 decks up.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { MIN_DECKS } from '#lib/tournaments/meta.js';
	import { legendNames } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();
	const percent = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
</script>

<h1 class="font-mono text-xl text-bright">Decks by Legend line</h1>
<p class="font-mono text-xs text-muted">
	The {data.shelves.length} most-played of {data.lines} lines · {data.decks} decks
</p>

<div class="mt-5 space-y-4">
	{#each data.shelves as shelf (shelf.line)}
		<section class="rounded-2xl border border-edge bg-shell p-4">
			<div class="flex flex-wrap items-center gap-4">
				<div class="flex w-52 shrink-0 gap-1">
					{#each shelf.legends as slug (slug)}<LegendArt
							{slug}
							sizes="100px"
							class="flex-1"
						/>{/each}
				</div>
				<div class="min-w-0 flex-1">
					<h2 class="text-sm font-semibold text-bright">{legendNames(shelf.legends)}</h2>
					<p class="font-mono text-[11px] text-muted">
						{shelf.deckCount} deck{shelf.deckCount === 1 ? '' : 's'} · best finish {shelf.bestRank}
						· win rate
						{#if shelf.winRate === null}
							<span title="Fewer than {MIN_DECKS} decks: not enough to quote a rate">—</span>
						{:else}
							{percent(shelf.winRate)}
						{/if}
					</p>
				</div>
				<ul class="flex flex-wrap gap-2">
					{#each shelf.decks as deck (deck.guid)}
						<li>
							<a
								href={href(`/tournaments/decks/${deck.guid}`, { period: data.period.id })}
								class="block rounded-lg border border-edge px-3 py-1.5 text-xs hover:border-neon-dim"
							>
								<span class="block font-mono {deck.rank === 1 ? 'text-neon' : 'text-muted'}">
									{deck.rank}<span class="text-[10px]">/{deck.playerCount}</span>
								</span>
								<span class="block max-w-28 truncate text-bright">{deck.player}</span>
								<span class="font-mono text-[10px] text-muted"
									>{deck.wins}-{deck.losses}-{deck.draws}</span
								>
							</a>
						</li>
					{/each}
					{#if shelf.deckCount > shelf.decks.length}
						<li class="self-center font-mono text-[11px] text-muted">
							+{shelf.deckCount - shelf.decks.length} more
						</li>
					{/if}
				</ul>
			</div>
		</section>
	{:else}
		<p class="p-6 text-center text-sm text-muted">
			No decks with a readable set of Legends in this period.
		</p>
	{/each}
</div>
