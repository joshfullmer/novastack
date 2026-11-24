<script lang="ts">
	// The end of the event. When it had a playoff, a bracket: the rounds from the quarterfinals (or
	// whatever it cut to) across to the final, each match with both players' Legends and the games, the
	// winner picked out, and beside it who finished where. Pointing at a player (or tapping, on a phone)
	// follows them: their rows light up in the bracket and the rail, and the lines they won along. A click
	// opens the list they played. An event that was Swiss alone has no bracket to draw, so it is a podium:
	// the top three as art-led panels with their lists, fourth to eighth as tiles, everyone else as chips.
	import { cn } from '#lib/cn.js';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import TournamentDeck from '#lib/components/tournaments/TournamentDeck.svelte';
	import { buildBracket, placements, type BracketSide } from '#lib/tournaments/bracket.js';
	import { legendNames } from '#lib/tournaments/present.js';

	let { data } = $props();
	const standings = $derived(data.event.standings);
	const podium = $derived(standings.slice(0, 3));
	const topEight = $derived(standings.slice(3, 8));
	const field = $derived(standings.slice(8));
	const bracket = $derived(buildBracket(data.event));
	const finishes = $derived(bracket ? placements(data.event.standings, bracket.cut) : []);

	// The player being followed, by id. Hover and focus set it and clear it again; a tap sets it and stays.
	let following = $state<number | null>(null);
	const follow = (id: number) => (following = id);
	const unfollow = () => (following = null);
	/** A phone has no hover: a first tap on a player follows them, and only a second opens their list. */
	const touch = () => window.matchMedia('(hover: none)').matches;
	function tapped(event: MouseEvent, side: BracketSide) {
		if (!touch() || following === side.playerId) return;
		event.preventDefault();
		follow(side.playerId);
	}
	const MEDAL = [cn('text-card-yellow'), cn('text-body'), cn('text-card-red')];
</script>

{#snippet face(side: BracketSide, size: string)}
	<span class="flex shrink-0 -space-x-1.5">
		{#each side.legends as slug (slug)}
			<LegendArt {slug} sizes="32px" class="{size} ring-1 ring-void" />
		{/each}
	</span>
{/snippet}

{#snippet seat(side: BracketSide, games: number, outcome: 'won' | 'lost' | 'open')}
	{@const tone = cn(
		'group flex w-full items-center gap-2 border-l-2 px-2 py-1.5 text-left',
		outcome === 'won' && 'border-neon text-bright',
		outcome === 'lost' && 'border-transparent text-muted',
		outcome === 'open' && 'border-transparent text-body',
		following === side.playerId ? 'bg-neon/20' : outcome === 'won' ? 'bg-neon/10' : ''
	)}
	{#snippet inside()}
		{@render face(side, 'w-5')}
		<span class="min-w-0 flex-1 truncate {outcome === 'won' ? 'font-semibold' : ''}">
			{side.name}
		</span>
		{#if side.deck}
			<span
				class="hidden font-mono text-[10px] text-neon group-hover:inline group-focus-visible:inline"
				aria-hidden="true">→</span
			>
		{:else}
			<span class="font-mono text-[10px] text-muted" title="No deck registered">no deck</span>
		{/if}
		<span
			class="rounded px-1.5 font-mono text-xs tabular-nums {outcome === 'won'
				? 'bg-neon/25 text-bright'
				: 'text-muted'}">{games}{outcome === 'won' ? ' ✓' : ''}</span
		>
	{/snippet}
	{#if side.deck}
		<a
			href="/meta/decks/{side.deck}"
			class="{tone} hover:bg-surface"
			title="Open {side.name}'s deck · #{side.rank} · {side.record.wins}-{side.record.losses}-{side
				.record.draws}"
			onmouseenter={() => follow(side.playerId)}
			onmouseleave={unfollow}
			onfocus={() => follow(side.playerId)}
			onblur={unfollow}
			onclick={(event) => tapped(event, side)}
		>
			{@render inside()}
		</a>
	{:else}
		<button
			type="button"
			class={tone}
			title="{side.name} · #{side.rank} · no deck registered"
			onmouseenter={() => follow(side.playerId)}
			onmouseleave={unfollow}
			onfocus={() => follow(side.playerId)}
			onblur={unfollow}
			onclick={() => (following = following === side.playerId ? null : side.playerId)}
		>
			{@render inside()}
		</button>
	{/if}
{/snippet}

{#snippet tileBody(side: BracketSide, champion: boolean)}
	{#if champion}
		<div class="w-full">
			{#if side.legends.length > 0}
				<div class="mb-2 flex gap-1">
					{#each side.legends as slug (slug)}
						<LegendArt {slug} sizes="96px" class="flex-1 shadow-lg" />
					{/each}
				</div>
			{/if}
			<div class="flex items-baseline justify-between gap-2">
				<span class="min-w-0 truncate text-base font-semibold text-bright">{side.name}</span>
				<span class="shrink-0 font-mono text-[11px] {side.deck ? 'text-neon' : 'text-muted'}">
					{side.deck ? 'deck →' : 'no deck'}
				</span>
			</div>
			<span class="font-mono text-[11px] text-muted">
				{side.record.wins}-{side.record.losses}-{side.record.draws}
			</span>
		</div>
	{:else}
		{#if side.legends.length > 0}{@render face(side, 'w-6')}{/if}
		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm text-bright">{side.name}</span>
			<span class="font-mono text-[11px] text-muted">
				{side.record.wins}-{side.record.losses}-{side.record.draws}
			</span>
		</span>
		<span class="font-mono text-[11px] {side.deck ? 'text-neon' : 'text-muted'}">
			{side.deck ? 'deck →' : 'no deck'}
		</span>
	{/if}
{/snippet}

<!-- A finisher in the rail. The whole tile opens their deck when they registered one. -->
{#snippet tile(side: BracketSide, g: number)}
	{@const tone = cn(
		'flex items-center gap-2 rounded-lg border px-2 py-1.5',
		following === side.playerId
			? 'border-neon bg-neon/15'
			: g === 0
				? 'border-neon-dim bg-shell'
				: 'border-edge bg-shell'
	)}
	{#if side.deck}
		<a
			href="/meta/decks/{side.deck}"
			class="{tone} hover:bg-surface"
			onmouseenter={() => follow(side.playerId)}
			onmouseleave={unfollow}
			onfocus={() => follow(side.playerId)}
			onblur={unfollow}
			onclick={(event) => tapped(event, side)}
		>
			{@render tileBody(side, g === 0)}
		</a>
	{:else}
		<button
			type="button"
			class="{tone} w-full text-left"
			title="No deck registered"
			onmouseenter={() => follow(side.playerId)}
			onmouseleave={unfollow}
			onfocus={() => follow(side.playerId)}
			onblur={unfollow}
			onclick={() => (following = following === side.playerId ? null : side.playerId)}
		>
			{@render tileBody(side, g === 0)}
		</button>
	{/if}
{/snippet}

{#if bracket}
	<div class="flex flex-col gap-6 lg:flex-row lg:items-start">
		<aside class="shrink-0 lg:sticky lg:top-nav lg:w-60" aria-label="Placements">
			<div class="space-y-5">
				{#each finishes as group, g (group.label)}
					<section>
						<h2 class="mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">
							{group.label}
						</h2>
						<ul class="space-y-1">
							{#each group.players as side (side.playerId)}
								<li>{@render tile(side, g)}</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		</aside>

		<section class="min-w-0 flex-1 overflow-x-auto pb-2" aria-label="Bracket">
			<div class="mb-3 flex items-center gap-2 font-mono text-[11px]">
				<span class="rounded-full border border-neon-dim px-2 py-0.5 text-neon">
					Top {bracket.cut}
				</span>
				{#if following !== null}
					<button
						type="button"
						onclick={unfollow}
						class="rounded-full border border-edge px-2 py-0.5 text-muted hover:text-body"
					>
						following {data.event.standings.find((s) => s.playerId === following)?.name} ✕
					</button>
				{:else}
					<span class="text-muted"
						>Point at a player to follow their path; click one to open their deck.</span
					>
				{/if}
			</div>
			<div class="flex min-w-max items-stretch gap-12">
				{#each bracket.rounds as round, r (round.number)}
					<div class="flex w-60 flex-col">
						<h3 class="mb-2 font-mono text-[11px] tracking-wide text-muted uppercase">
							{round.name}
						</h3>
						<ol class="flex flex-1 flex-col">
							{#each round.matches as match, i (i)}
								{@const winnerId =
									match.winner === 'a'
										? match.a.playerId
										: match.winner === 'b'
											? match.b.playerId
											: null}
								{@const wonOut = following !== null && winnerId === following}
								{@const cameIn =
									following !== null &&
									(match.a.playerId === following || match.b.playerId === following)}
								<li class="relative flex flex-1 items-center py-1.5">
									<div
										class="w-full overflow-hidden rounded-lg border border-edge bg-shell text-sm"
									>
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
										{#if match.table !== null || match.draws > 0}
											<p
												class="border-t border-edge/60 px-2 py-0.5 font-mono text-[10px] text-muted"
											>
												{#if match.table !== null}table {match.table}{/if}
												{#if match.draws > 0}
													{match.table !== null ? ' · ' : ''}{match.draws} draw{match.draws === 1
														? ''
														: 's'}
												{/if}
											</p>
										{/if}
									</div>
									{#if bracket.joined}
										{#if r < bracket.rounds.length - 1}
											<span
												class="absolute top-1/2 left-full w-6 border-t {wonOut
													? 'border-t-2 border-neon'
													: 'border-edge'}"
											></span>
											<span
												class="absolute left-[calc(100%+1.5rem)] {wonOut
													? 'w-0.5 bg-neon'
													: 'w-px bg-edge'} {i % 2 === 0 ? 'top-1/2 h-1/2' : 'bottom-1/2 h-1/2'}"
											></span>
										{/if}
										{#if r > 0}
											<span
												class="absolute top-1/2 right-full w-6 border-t {cameIn
													? 'border-t-2 border-neon'
													: 'border-edge'}"
											></span>
										{/if}
									{/if}
								</li>
							{/each}
						</ol>
					</div>
				{/each}
			</div>
		</section>
	</div>
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
						<div class="flex h-16 flex-1 items-center justify-center text-xs text-muted md:h-40">
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
