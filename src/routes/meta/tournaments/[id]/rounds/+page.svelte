<script lang="ts">
	// Rounds: the event as it happened. Pick a round (`?round=`, so a link names one) to see its tables,
	// each side's Legends and the game score; the final standings sit beside it, not on top.
	import { page } from '$app/state';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import type { MatchView } from '#lib/tournaments/event-view.js';
	import { legendNames } from '#lib/tournaments/present.js';

	let { data } = $props();
	const event = $derived(data.event);

	const last = $derived(event.rounds.at(-1)?.number ?? 1);
	const round = $derived.by(() => {
		const asked = Number(page.url.searchParams.get('round'));
		return event.rounds.some((r) => r.number === asked) ? asked : last;
	});
	const matches = $derived(event.matches.filter((m) => m.round === round));

	const legendsOf = $derived(
		new Map(event.standings.map((s) => [s.playerId, s.deck?.legends ?? []]))
	);
	const won = (match: MatchView, side: 'a' | 'b') =>
		match.kind === 'played' &&
		(side === 'a' ? match.gamesA > match.gamesB : match.gamesB > match.gamesA);
</script>

{#snippet player(match: MatchView, who: 'a' | 'b')}
	{@const side = who === 'a' ? match.a : match.b}
	{#if side}
		{@const legends = legendsOf.get(side.playerId) ?? []}
		<div
			class="flex min-w-0 items-center gap-2 {who === 'b'
				? 'md:flex-row-reverse md:text-right'
				: ''}"
		>
			<span class="flex shrink-0 -space-x-2">
				{#each legends as slug (slug)}
					<LegendArt {slug} sizes="40px" class="w-6 ring-1 ring-void" />
				{/each}
			</span>
			<span class="min-w-0">
				<span
					class="block truncate text-sm {won(match, who)
						? 'font-semibold text-bright'
						: 'text-body'}"
				>
					{side.name}
				</span>
				<span class="block truncate text-[11px] text-muted">{legendNames(legends) || '—'}</span>
			</span>
		</div>
	{:else}
		<span class="text-sm text-muted">bye</span>
	{/if}
{/snippet}

<div class="flex flex-wrap gap-1.5" role="group" aria-label="Rounds">
	{#each event.rounds as r (r.number)}
		<a
			rel="nofollow"
			href="?round={r.number}"
			aria-current={r.number === round ? 'true' : undefined}
			class="rounded-full border px-3 py-1 font-mono text-xs {r.number === round
				? 'border-neon bg-neon/10 text-bright'
				: 'border-edge text-muted hover:text-body'}"
		>
			{r.name}
		</a>
	{/each}
</div>

<div class="mt-5 grid gap-6 lg:grid-cols-[1fr_20rem]">
	<ul class="space-y-2">
		{#each matches as match, i (i)}
			<!-- A phone stacks the two players with their own game score beside each; from `md` they sit either side of
			     the score. -->
			<li
				class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border border-edge bg-shell px-3 py-3 md:grid-cols-[1fr_5rem_1fr] md:px-4"
			>
				{@render player(match, 'a')}
				<span class="font-mono text-lg text-bright md:hidden"
					>{match.kind === 'bye' ? 'BYE' : match.gamesA}</span
				>
				<span class="hidden text-center font-mono md:block">
					{#if match.kind === 'bye'}
						<span class="text-xs text-muted">BYE</span>
					{:else}
						<span class="text-bright">{match.gamesA}–{match.gamesB}</span>
						{#if match.kind === 'draw'}
							<span class="block text-[10px] text-muted">draw</span>
						{:else if match.draws > 0}
							<span class="block text-[10px] text-muted">{match.draws} drawn</span>
						{/if}
					{/if}
					{#if match.table}<span class="block text-[10px] text-muted">T{match.table}</span>{/if}
				</span>
				{@render player(match, 'b')}
				<span class="font-mono text-lg text-bright md:hidden"
					>{match.kind === 'bye' ? '' : match.gamesB}</span
				>
				{#if match.table || match.kind === 'draw' || match.draws > 0}
					<span class="col-span-2 font-mono text-[10px] text-muted md:hidden">
						{[
							match.table ? `Table ${match.table}` : '',
							match.kind === 'draw' ? 'draw' : match.draws > 0 ? `${match.draws} drawn` : ''
						]
							.filter(Boolean)
							.join(' · ')}
					</span>
				{/if}
			</li>
		{:else}
			<li class="p-6 text-center text-sm text-muted">No matches recorded for this round.</li>
		{/each}
	</ul>

	<aside class="lg:sticky lg:top-20 lg:self-start">
		<h2 class="mb-2 font-mono text-[11px] tracking-wide text-muted uppercase">Final standings</h2>
		<ol class="divide-y divide-edge/60 rounded-lg border border-edge bg-shell text-sm">
			{#each event.standings as s (s.playerId)}
				<li class="flex items-center gap-2 px-3 py-1.5">
					<span class="w-5 font-mono text-xs text-muted">{s.rank}</span>
					<span class="min-w-0 flex-1 truncate">{s.name}</span>
					<span class="font-mono text-xs text-muted">{s.wins}-{s.losses}-{s.draws}</span>
				</li>
			{/each}
		</ol>
	</aside>
</div>
