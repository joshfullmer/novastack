<script lang="ts">
	// The decks by their set of Legends: one card per line, most played first. A card says how a line is
	// doing (its share of the field, win rate, top 8s and wins), then shows its best finishes with the event
	// each came from, and links through to every deck that ran it. A win rate appears only from `MIN_DECKS` decks.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { MIN_DECKS } from '#lib/tournaments/meta.js';
	import { periodParams } from '#lib/tournaments/period.js';
	import { formatDate, legendNames, ordinal, winTone } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();

	const percent = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
	/** Bars are against the most played line, so the widest fills its track and the rest read relative to it. */
	const widest = $derived(Math.max(...data.shelves.map((shelf) => shelf.deckCount), 1));
	const decksOf = (line: string) => href('/meta/decks', { ...periodParams(data.period), line });
</script>

<h1 class="sr-only">Decks by Legends</h1>
<p class="font-mono text-xs text-muted">
	The {data.shelves.length} most-played of {data.lines} sets of Legends · {data.decks} decks
</p>

<div class="mt-5 grid gap-4 xl:grid-cols-2">
	{#each data.shelves as shelf (shelf.line)}
		{@const share = shelf.deckCount / data.decks}
		<section class="flex flex-col overflow-hidden rounded-2xl border border-edge bg-shell">
			<header class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5">
				<a
					href={decksOf(shelf.line)}
					tabindex="-1"
					aria-hidden="true"
					class="flex w-44 shrink-0 gap-1 transition-opacity hover:opacity-90"
				>
					{#each shelf.legends as slug (slug)}<LegendArt
							{slug}
							sizes="100px"
							class="flex-1 shadow-lg"
						/>{/each}
				</a>
				<div class="min-w-0 flex-1">
					<h2 class="text-base leading-snug font-semibold text-bright">
						<a href={decksOf(shelf.line)} class="hover:underline">{legendNames(shelf.legends)}</a>
					</h2>
					<p class="mt-1 font-mono text-xs text-muted">
						{shelf.deckCount}
						{shelf.deckCount === 1 ? 'deck' : 'decks'} · {percent(share)} of the field
					</p>
					<div class="mt-2 h-1.5 rounded-full bg-edge/50" aria-hidden="true">
						<div
							class="h-full rounded-full bg-neon"
							style:width="{(shelf.deckCount / widest) * 100}%"
						></div>
					</div>
				</div>
			</header>

			<dl
				class="grid grid-cols-4 divide-x divide-edge/60 border-y border-edge/60 text-center font-mono"
			>
				<div class="px-2 py-2">
					<dt class="text-[10px] tracking-wide text-muted uppercase">Win rate</dt>
					<dd
						class="text-base {winTone(shelf.winRate)}"
						title={shelf.winRate === null
							? `Fewer than ${MIN_DECKS} decks: not enough to quote a rate`
							: undefined}
					>
						{shelf.winRate === null ? 'n<' + MIN_DECKS : percent(shelf.winRate)}
					</dd>
				</div>
				<div class="px-2 py-2">
					<dt class="text-[10px] tracking-wide text-muted uppercase">Top 8</dt>
					<dd class="text-base text-body">
						{shelf.top8}<span class="ml-1 text-[10px] text-muted"
							>{percent(shelf.top8 / shelf.deckCount)}</span
						>
					</dd>
				</div>
				<div class="px-2 py-2">
					<dt class="text-[10px] tracking-wide text-muted uppercase">Won</dt>
					<dd class="text-base text-body">
						{shelf.wins}<span class="ml-1 text-[10px] text-muted"
							>{percent(shelf.wins / shelf.deckCount)}</span
						>
					</dd>
				</div>
				<div class="px-2 py-2">
					<dt class="text-[10px] tracking-wide text-muted uppercase">Best</dt>
					<dd class="text-base {shelf.bestRank === 1 ? 'text-neon' : 'text-body'}">
						{ordinal(shelf.bestRank)}
					</dd>
				</div>
			</dl>

			<ol class="divide-y divide-edge/60">
				{#each shelf.decks as deck (deck.guid)}
					<li>
						<a
							href={href(`/meta/decks/${deck.guid}`, periodParams(data.period))}
							class="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 hover:bg-surface"
						>
							<span class="font-mono text-sm {deck.rank === 1 ? 'text-neon' : 'text-muted'}">
								{deck.rank}<span class="text-[10px] text-muted">/{deck.playerCount}</span>
							</span>
							<span class="min-w-0">
								<span class="block truncate text-sm text-bright">{deck.player}</span>
								<span class="block truncate text-[11px] text-muted">
									{deck.eventName} · {formatDate(deck.startsAt)}
								</span>
							</span>
							<span class="font-mono text-xs text-muted"
								>{deck.wins}-{deck.losses}-{deck.draws}</span
							>
						</a>
					</li>
				{/each}
			</ol>

			{#if shelf.deckCount > shelf.decks.length}
				<a
					href={decksOf(shelf.line)}
					class="mt-auto border-t border-edge/60 px-4 py-2.5 text-center font-mono text-xs text-muted hover:bg-surface hover:text-neon"
				>
					All {shelf.deckCount} decks →
				</a>
			{/if}
		</section>
	{:else}
		<p class="p-6 text-center text-sm text-muted xl:col-span-2">
			No decks with a readable set of Legends in this period.
		</p>
	{/each}
</div>
