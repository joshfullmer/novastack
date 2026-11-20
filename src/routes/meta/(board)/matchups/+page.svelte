<script lang="ts">
	// Matchup matrix: the page is one heat-map. A row's win rate against a column is cyan above 50% and
	// red below; fainter means fewer matches behind it. Only the most-played decks are drawn (by RAM, as
	// players name them, or by their Legends), and only matches between two decks of different groups count
	// (no mirrors, byes, forfeits or deck-less players).
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { periodParams } from '#lib/tournaments/period.js';
	import { ramLabel, ramShorthand } from '#lib/tournaments/ram.js';
	import { legendNames, RAM_PER_LEGEND } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();
	const meta = $derived(data.meta);

	const groups = $derived(
		meta.matrixLines.flatMap((key) => {
			const group = (meta.matrixBy === 'ram' ? meta.byRam : meta.byLine).find((g) => g.key === key);
			return group ? [group] : [];
		})
	);
	/** A group named in words, for tooltips: its Legends, or its RAM as players say it. */
	const label = (group: { key: string; legends: string[] }) =>
		meta.matrixBy === 'ram'
			? (ramShorthand(group.key, RAM_PER_LEGEND) ?? ramLabel(group.key))
			: legendNames(group.legends);
	/** The decks behind a row or a column: the list filtered to that RAM, or that exact set of Legends. */
	const decksOf = (group: { key: string }) =>
		href('/meta/decks', {
			...periodParams(data.period),
			[meta.matrixBy === 'ram' ? 'ram' : 'line']: group.key
		});
	const cellAt = (a: string, b: string) => meta.matrix.find((c) => c.a === a && c.b === b);
	const BY = [
		['ram', 'RAM'],
		['line', 'Legends']
	] as const;
	const percent = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

	/** Win rate → colour: cyan above 50%, red below, chroma by distance, faded by sample size. */
	function background(winRate: number | null, matches: number) {
		if (winRate === null) return 'transparent';
		const away = Math.abs(winRate - 0.5) * 2;
		const alpha = Math.min(1, 0.25 + matches / 6);
		return `oklch(${34 + away * 22}% ${0.04 + away * 0.15} ${winRate >= 0.5 ? 195 : 27} / ${alpha})`;
	}
</script>

<header class="flex flex-wrap items-end justify-between gap-3 border-b border-edge pb-4">
	<div>
		<h1 class="sr-only">Matchups</h1>
		<p class="font-mono text-xs text-muted">
			The row's win rate against the column · {meta.crossMatches} matches between these {meta.matrixBy ===
			'ram'
				? 'RAMs'
				: 'sets of Legends'}{meta.crossMatchesTotal > meta.crossMatches
				? ` (of ${meta.crossMatchesTotal} between decks of different ${meta.matrixBy === 'ram' ? 'RAMs' : 'sets of Legends'})`
				: ''} · a draw counts half
		</p>
	</div>
	<div
		class="flex rounded-full border border-edge p-0.5 font-mono text-xs"
		role="group"
		aria-label="Group by"
	>
		{#each BY as [key, label] (key)}
			<a
				rel="nofollow"
				href={href('/meta/matchups', { ...periodParams(data.period), by: key })}
				aria-current={data.by === key ? 'true' : undefined}
				class="rounded-full px-3 py-1 {data.by === key
					? 'bg-neon text-void'
					: 'text-muted hover:text-body'}">{label}</a
			>
		{/each}
	</div>
</header>

{#if groups.length < 2}
	<p class="mt-8 text-center text-sm text-muted">
		A matrix needs at least two {meta.matrixBy === 'ram' ? 'RAMs' : 'sets of Legends'} with decks; this
		period has {groups.length}.
	</p>
{:else}
	<div class="mt-6 overflow-x-auto">
		<table class="mx-auto border-separate border-spacing-1.5 text-center">
			<thead>
				<tr>
					<th class="w-64 text-left font-mono text-[11px] font-normal text-muted uppercase"
						>Deck · share</th
					>
					{#each groups as group (group.key)}
						<th class="w-24 align-bottom font-normal">
							<a
								rel="nofollow"
								href={decksOf(group)}
								title="{label(group)}: its decks"
								class="block rounded-lg px-1 py-1.5 hover:bg-shell"
							>
								{#if meta.matrixBy === 'ram'}
									<RamCode ram={group.key} class="text-base" />
								{:else}
									<span class="mx-auto flex w-16 flex-col gap-0.5">
										{#each group.legends as slug (slug)}<LegendArt
												{slug}
												sizes="64px"
												class="w-full"
											/>{/each}
									</span>
								{/if}
							</a>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each groups as row (row.key)}
					<tr>
						<th class="rounded-lg bg-shell text-left font-normal hover:bg-surface">
							<a
								rel="nofollow"
								href={decksOf(row)}
								title="{label(row)}: its decks"
								class="flex items-center gap-2 p-2.5"
							>
								{#if meta.matrixBy !== 'ram'}
									<span class="flex -space-x-2">
										{#each row.legends as slug (slug)}<LegendArt
												{slug}
												sizes="40px"
												class="w-7 ring-1 ring-void"
											/>{/each}
									</span>
								{/if}
								<span class="min-w-0">
									<span class="block truncate text-sm text-bright">
										{#if meta.matrixBy === 'ram'}<RamCode
												ram={row.key}
												class="text-base"
											/>{:else}{legendNames(row.legends)}{/if}
									</span>
									<span class="font-mono text-[11px] text-muted"
										>{percent(row.share)} · {row.decks} decks</span
									>
								</span>
							</a>
						</th>
						{#each groups as col (col.key)}
							{@const cell = cellAt(row.key, col.key)}
							<td
								class="h-[4.5rem] rounded-lg font-mono"
								style:background={row.key === col.key
									? 'transparent'
									: background(cell?.winRate ?? null, cell?.matches ?? 0)}
								title="{label(row)} vs {label(col)}: {cell?.matches ?? 0} matches"
							>
								{#if row.key === col.key}
									<span class="text-edge">—</span>
								{:else if cell && cell.matches > 0}
									<span class="text-base text-bright">{percent(cell.winRate)}</span>
									<span class="block text-[11px] text-muted">n={cell.matches}</span>
								{:else}
									<span class="text-xs text-edge">·</span>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
