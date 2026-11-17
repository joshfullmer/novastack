<script lang="ts">
	// Tier list: a ranked ladder, one row per deck archetype, ordered by how much of the field played it.
	// Group by Legend line, a single Legend, or just the colours; count every deck, only the top 8, or
	// only the winners; conversion columns say how often an archetype reached the top 8 or won. A win
	// rate is quoted only from MIN_DECKS decks up: fewer is noise.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { MIN_DECKS, type GroupStat } from '#lib/tournaments/meta.js';
	import { groupByColours, legendNames } from '#lib/tournaments/present.js';

	let { data } = $props();
	const meta = $derived(data.meta);

	let by = $state<'line' | 'legend' | 'colours'>('line');
	let part = $state<'decks' | 'top8' | 'wins'>('decks');

	const DOT: Record<string, string> = {
		Red: 'bg-card-red',
		Yellow: 'bg-card-yellow',
		Green: 'bg-card-green',
		Blue: 'bg-card-blue'
	};
	const PARTS = [
		['decks', 'All decks'],
		['top8', 'Top 8'],
		['wins', 'Winners']
	] as const;
	const GROUPS = [
		['line', 'Legend line'],
		['legend', 'Legend'],
		['colours', 'Colours']
	] as const;

	const base = $derived.by((): GroupStat[] => {
		if (by === 'line') return meta.byLine;
		if (by === 'legend') return meta.byLegend;
		return groupByColours(meta.byLine);
	});
	/** Who is counted: every deck, only those that made the top 8, or only event winners. */
	const rows = $derived.by(() => {
		const total = base.reduce((n, g) => n + g[part], 0) || 1;
		return base
			.filter((g) => g[part] > 0)
			.map((g) => ({ ...g, partShare: g[part] / total }))
			.sort((a, b) => b[part] - a[part] || b.decks - a.decks || a.key.localeCompare(b.key));
	});
	const widest = $derived(Math.max(...rows.map((r) => r.partShare), 0.01));

	const percent = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
	const tone = (rate: number | null) =>
		rate === null
			? 'text-muted'
			: rate >= 0.55
				? 'text-card-green'
				: rate <= 0.45
					? 'text-card-red'
					: 'text-body';
</script>

<header class="flex flex-wrap items-end justify-between gap-3 border-b border-edge pb-4">
	<div>
		<h1 class="font-mono text-xl text-bright">Meta</h1>
		<p class="font-mono text-xs text-muted">{meta.decks} decks with a readable set of Legends</p>
	</div>
	<div class="flex flex-wrap gap-2 font-mono text-xs">
		<div class="flex rounded-full border border-edge p-0.5" role="group" aria-label="Count">
			{#each PARTS as [key, label] (key)}
				<button
					class="rounded-full px-3 py-1 {part === key
						? 'bg-neon text-void'
						: 'text-muted hover:text-body'}"
					aria-pressed={part === key}
					onclick={() => (part = key)}>{label}</button
				>
			{/each}
		</div>
		<div class="flex rounded-full border border-edge p-0.5" role="group" aria-label="Group by">
			{#each GROUPS as [key, label] (key)}
				<button
					class="rounded-full px-3 py-1 {by === key
						? 'bg-neon text-void'
						: 'text-muted hover:text-body'}"
					aria-pressed={by === key}
					onclick={() => (by = key)}>{label}</button
				>
			{/each}
		</div>
	</div>
</header>

<div
	class="mt-3 grid grid-cols-[2rem_1fr_9rem_4rem_4rem_4rem_3rem] gap-x-4 px-3 font-mono text-[11px] tracking-wide text-muted uppercase"
	aria-hidden="true"
>
	<span>#</span><span></span><span
		>Share of {part === 'decks' ? 'field' : part === 'top8' ? 'top 8' : 'winners'}</span
	>
	<span class="text-right">Win rate</span>
	<span class="text-right" title="Of its decks, how many reached the top 8">→ Top 8</span>
	<span class="text-right" title="Of its decks, how many won an event">→ Won</span>
	<span class="text-right">Decks</span>
</div>

<ol class="mt-1 space-y-1">
	{#each rows as group, i (group.key)}
		<li
			class="grid grid-cols-[2rem_1fr_9rem_4rem_4rem_4rem_3rem] items-center gap-x-4 rounded-lg px-3 py-2 odd:bg-shell/60"
		>
			<span class="font-mono text-sm {i < 3 ? 'text-neon' : 'text-muted'}">{i + 1}</span>
			<span class="flex min-w-0 items-center gap-3">
				{#if by === 'colours'}
					<span class="flex gap-1">
						{#each group.key.split('+') as colour (colour)}
							<span class="size-5 rounded-full {DOT[colour] ?? 'bg-edge'}"></span>
						{/each}
					</span>
					<span class="text-bright">{group.key.replaceAll('+', ' / ')}</span>
				{:else}
					<span class="flex shrink-0 -space-x-3">
						{#each group.legends as slug (slug)}
							<LegendArt
								{slug}
								sizes="64px"
								class="{by === 'legend' ? 'w-10' : 'w-9'} ring-1 ring-void"
							/>
						{/each}
					</span>
					<span class="min-w-0 truncate text-bright">{legendNames(group.legends)}</span>
				{/if}
			</span>
			<span class="flex items-center gap-2">
				<span class="h-2 flex-1 rounded-full bg-edge/50">
					<span
						class="block h-2 rounded-full bg-neon"
						style:width="{(group.partShare / widest) * 100}%"
					></span>
				</span>
				<span class="w-9 text-right font-mono text-xs">{percent(group.partShare)}</span>
			</span>
			{#if group.decks >= MIN_DECKS}
				<span
					class="text-right font-mono text-sm {tone(group.winRate)}"
					title="{group.matches} matches"
				>
					{percent(group.winRate)}
				</span>
			{:else}
				<span
					class="text-right font-mono text-xs text-muted"
					title="Fewer than {MIN_DECKS} decks: not enough to quote a rate">n&lt;{MIN_DECKS}</span
				>
			{/if}
			<span class="text-right font-mono text-sm">
				{group.top8}<span class="ml-1 text-[10px] text-muted"
					>{percent(group.top8 / group.decks)}</span
				>
			</span>
			<span class="text-right font-mono text-sm">
				{group.wins}<span class="ml-1 text-[10px] text-muted"
					>{percent(group.wins / group.decks)}</span
				>
			</span>
			<span class="text-right font-mono text-sm text-muted">{group.decks}</span>
		</li>
	{:else}
		<li class="p-6 text-center text-sm text-muted">
			No decks with a readable set of Legends in this period.
		</li>
	{/each}
</ol>
{#if by === 'legend'}
	<p class="mt-3 text-xs text-muted">Each deck counts once per Legend, so shares add up to 300%.</p>
{/if}
