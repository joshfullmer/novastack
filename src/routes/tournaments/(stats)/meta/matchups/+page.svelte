<script lang="ts">
	// Matchup matrix: the page is one heat-map. A row's win rate against a column is cyan above 50% and
	// red below; fainter means fewer matches behind it. Only the most-played Legend lines are drawn, and
	// only matches between two decks of different lines count (no mirrors, byes, forfeits or deck-less players).
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { legendNames } from '#lib/tournaments/present.js';

	let { data } = $props();
	const meta = $derived(data.meta);

	const groups = $derived(
		meta.matrixLines.flatMap((key) => {
			const group = meta.byLine.find((g) => g.key === key);
			return group ? [group] : [];
		})
	);
	const cellAt = (a: string, b: string) => meta.matrix.find((c) => c.a === a && c.b === b);
	const percent = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

	/** Win rate → colour: cyan above 50%, red below, chroma by distance, faded by sample size. */
	function background(winRate: number | null, matches: number) {
		if (winRate === null) return 'transparent';
		const away = Math.abs(winRate - 0.5) * 2;
		const alpha = Math.min(1, 0.25 + matches / 6);
		return `oklch(${34 + away * 22}% ${0.04 + away * 0.15} ${winRate >= 0.5 ? 195 : 27} / ${alpha})`;
	}
</script>

<header class="border-b border-edge pb-4">
	<h1 class="font-mono text-xl text-bright">Matchups</h1>
	<p class="font-mono text-xs text-muted">
		The row's win rate against the column · {meta.crossMatches} matches between these lines{meta.crossMatchesTotal >
		meta.crossMatches
			? ` (of ${meta.crossMatchesTotal} between decks of different lines)`
			: ''} · a draw counts half
	</p>
</header>

{#if groups.length < 2}
	<p class="mt-8 text-center text-sm text-muted">
		A matrix needs at least two Legend lines with decks; this period has {groups.length}.
	</p>
{:else}
	<div class="mt-6 overflow-x-auto">
		<table class="border-separate border-spacing-1 text-center">
			<thead>
				<tr>
					<th class="w-56 text-left font-mono text-[11px] font-normal text-muted uppercase"
						>Deck · share</th
					>
					{#each groups as group (group.key)}
						<th class="w-20 align-bottom font-normal" title={legendNames(group.legends)}>
							<span class="mx-auto flex w-14 flex-col gap-0.5">
								{#each group.legends as slug (slug)}<LegendArt
										{slug}
										sizes="40px"
										class="w-full"
									/>{/each}
							</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each groups as row (row.key)}
					<tr>
						<th class="rounded-lg bg-shell p-2 text-left font-normal">
							<span class="flex items-center gap-2">
								<span class="flex -space-x-2">
									{#each row.legends as slug (slug)}<LegendArt
											{slug}
											sizes="40px"
											class="w-6 ring-1 ring-void"
										/>{/each}
								</span>
								<span class="min-w-0">
									<span class="block truncate text-xs text-bright">{legendNames(row.legends)}</span>
									<span class="font-mono text-[11px] text-muted"
										>{percent(row.share)} · {row.decks} decks</span
									>
								</span>
							</span>
						</th>
						{#each groups as col (col.key)}
							{@const cell = cellAt(row.key, col.key)}
							<td
								class="h-14 rounded-lg font-mono"
								style:background={row.key === col.key
									? 'transparent'
									: background(cell?.winRate ?? null, cell?.matches ?? 0)}
								title="{legendNames(row.legends)} vs {legendNames(col.legends)}: {cell?.matches ??
									0} matches"
							>
								{#if row.key === col.key}
									<span class="text-edge">—</span>
								{:else if cell && cell.matches > 0}
									<span class="text-sm text-bright">{percent(cell.winRate)}</span>
									<span class="block text-[10px] text-muted">n={cell.matches}</span>
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
