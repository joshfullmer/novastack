<script lang="ts">
	// The end of the event. When it had a playoff, a bracket: the rounds from the quarterfinals (or
	// whatever it cut to) across to the final, each match with both players' Legends and the games, the
	// winner picked out, a click to the list a player won with, and the champion above it. An event that
	// was Swiss alone has no bracket to draw, so it is a podium: the top three as art-led panels with
	// their lists, fourth to eighth as tiles, everyone else as chips.
	import { cn } from '#lib/cn.js';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import TournamentDeck from '#lib/components/tournaments/TournamentDeck.svelte';
	import { buildBracket, type BracketSide } from '#lib/tournaments/bracket.js';
	import { legendNames } from '#lib/tournaments/present.js';

	let { data } = $props();
	const standings = $derived(data.event.standings);
	const podium = $derived(standings.slice(0, 3));
	const topEight = $derived(standings.slice(3, 8));
	const field = $derived(standings.slice(8));
	const bracket = $derived(buildBracket(data.event));
	const MEDAL = [cn('text-card-yellow'), cn('text-body'), cn('text-card-red')];
</script>

{#snippet player(side: BracketSide, games: number, outcome: 'won' | 'lost' | 'open')}
	<span class="flex shrink-0 -space-x-1.5">
		{#each side.legends as slug (slug)}
			<LegendArt {slug} sizes="32px" class="w-5 ring-1 ring-void" />
		{/each}
	</span>
	<span class="min-w-0 flex-1 truncate {outcome === 'won' ? 'font-semibold' : ''}">{side.name}</span
	>
	<span class="font-mono text-xs tabular-nums">{games}</span>
{/snippet}

{#snippet seat(side: BracketSide, games: number, outcome: 'won' | 'lost' | 'open')}
	{@const tone = cn(
		'flex items-center gap-2 border-l-2 px-2 py-1.5',
		outcome === 'won' && 'border-neon bg-neon/10 text-bright',
		outcome === 'lost' && 'border-transparent text-muted',
		outcome === 'open' && 'border-transparent text-body'
	)}
	{#if side.deck}
		<a href="/tournaments/decks/{side.deck}" class="{tone} hover:bg-surface" title="Open the deck">
			{@render player(side, games, outcome)}
		</a>
	{:else}
		<div class={tone} title="No deck registered">{@render player(side, games, outcome)}</div>
	{/if}
{/snippet}

{#if bracket}
	{#if bracket.champion}
		{@const champion = bracket.champion}
		<section
			class="mb-6 flex flex-wrap items-center gap-5 rounded-2xl border border-neon-dim bg-shell p-4"
			aria-label="Champion"
		>
			{#if champion.legends.length > 0}
				<div class="flex w-56 gap-1">
					{#each champion.legends as slug (slug)}
						<LegendArt {slug} sizes="120px" class="flex-1 shadow-lg" />
					{/each}
				</div>
			{/if}
			<div class="min-w-0">
				<p class="font-mono text-[11px] tracking-wide text-neon uppercase">Champion</p>
				<h2 class="text-2xl font-semibold text-bright">{champion.name}</h2>
				<p class="text-sm text-muted">{legendNames(champion.legends)}</p>
				{#if champion.deck}
					<a
						href="/tournaments/decks/{champion.deck}"
						class="mt-1 inline-block font-mono text-xs text-neon hover:underline">Open the deck →</a
					>
				{/if}
			</div>
		</section>
	{/if}

	<section class="overflow-x-auto pb-2" aria-label="Bracket">
		<div class="flex min-w-max items-stretch gap-12">
			{#each bracket.rounds as round, r (round.number)}
				<div class="flex w-60 flex-col">
					<h2 class="mb-2 font-mono text-[11px] tracking-wide text-muted uppercase">
						{round.name}
					</h2>
					<ol class="flex flex-1 flex-col">
						{#each round.matches as match, i (i)}
							<li class="relative flex flex-1 items-center py-1.5">
								<div class="w-full overflow-hidden rounded-lg border border-edge bg-shell text-sm">
									{@render seat(
										match.a,
										match.gamesA,
										match.winner === 'a' ? 'won' : match.winner === 'b' ? 'lost' : 'open'
									)}
									<div class="border-t border-edge/60"></div>
									{@render seat(
										match.b,
										match.gamesB,
										match.winner === 'b' ? 'won' : match.winner === 'a' ? 'lost' : 'open'
									)}
								</div>
								{#if bracket.joined}
									{#if r < bracket.rounds.length - 1}
										<span class="absolute top-1/2 left-full w-6 border-t border-edge"></span>
										<span
											class="absolute left-[calc(100%+1.5rem)] w-px bg-edge {i % 2 === 0
												? 'top-1/2 h-1/2'
												: 'bottom-1/2 h-1/2'}"
										></span>
									{/if}
									{#if r > 0}
										<span class="absolute top-1/2 right-full w-6 border-t border-edge"></span>
									{/if}
								{/if}
							</li>
						{/each}
					</ol>
				</div>
			{/each}
		</div>
	</section>
{:else}
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
{/if}
