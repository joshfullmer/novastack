<script lang="ts">
	import { periodParams } from '#lib/tournaments/period.js';
	// One Tournament Deck: who played it and how it did, its path through the event (every round, the
	// opponent's Legends and the result), and the list.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import TournamentDeck from '#lib/components/tournaments/TournamentDeck.svelte';
	import { formatDate, legendNames } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();
	const deck = $derived(data.deck);

	const MARK = {
		W: 'text-card-green',
		L: 'text-card-red',
		D: 'text-card-yellow',
		BYE: 'text-muted'
	};
</script>

<a
	href={href('/tournaments/decks', periodParams(data.period))}
	class="font-mono text-xs text-muted hover:text-body"
>
	← All decks
</a>

<header class="mt-3 flex flex-wrap items-center gap-6 border-b border-edge pb-5">
	<div class="flex w-64 gap-1">
		{#each deck.legends as slug (slug)}<LegendArt
				{slug}
				sizes="120px"
				class="flex-1 shadow-lg"
			/>{/each}
	</div>
	<div class="min-w-0">
		<h1 class="text-2xl font-semibold text-bright">{deck.player}</h1>
		<p class="text-sm text-muted">{legendNames(deck.legends)}</p>
		<p class="mt-1 font-mono text-xs text-muted">
			Finished {deck.rank} of {deck.playerCount} · {deck.wins}-{deck.losses}-{deck.draws} ·
			<a href="/tournaments/{deck.eventId}" class="text-neon hover:underline">{deck.eventName}</a>
			· {formatDate(deck.startsAt)}
		</p>
	</div>
</header>

<div class="mt-6 grid gap-8 lg:grid-cols-[22rem_1fr]">
	<section aria-labelledby="path">
		<h2 id="path" class="mb-2 font-mono text-[11px] tracking-wide text-muted uppercase">
			Path through the event
		</h2>
		<ol class="space-y-1.5">
			{#each deck.path as step (step.round)}
				<li class="flex items-center gap-2 text-sm">
					<span class="w-5 font-mono text-xs text-muted">{step.round}</span>
					<span class="w-8 font-mono font-semibold {MARK[step.result]}">{step.result}</span>
					<span class="flex -space-x-1.5">
						{#each step.oppLegends as slug (slug)}
							<LegendArt {slug} sizes="32px" class="w-5 ring-1 ring-void" />
						{/each}
					</span>
					<span class="min-w-0 flex-1 truncate">{step.opponent ?? 'bye'}</span>
					<span class="font-mono text-xs text-muted">{step.score}</span>
				</li>
			{:else}
				<li class="text-sm text-muted">No matches recorded.</li>
			{/each}
		</ol>
	</section>

	<section aria-labelledby="list">
		<h2 id="list" class="mb-2 font-mono text-[11px] tracking-wide text-muted uppercase">
			Decklist
		</h2>
		<TournamentDeck {deck} />
	</section>
</div>
