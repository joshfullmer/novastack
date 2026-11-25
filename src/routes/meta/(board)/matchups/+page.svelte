<script lang="ts">
	// Matchup matrix: the page is one heat-map. A row's win rate against a column is cyan above 50% and
	// red below; fainter means fewer matches behind it. Only the most-played decks are drawn (by RAM, as
	// players name them, or by their Legends), and only matches between two decks of different groups count
	// (no mirrors, byes, forfeits or deck-less players), in every round or only the Swiss rounds or the top cut. On a phone the same grid is compressed to fit the
	// width (a short row header, a win rate per cell), and tapping a cell says how many matches are behind it.
	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import Pills from '#lib/components/tournaments/Pills.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { PHASES } from '#lib/tournaments/meta.js';
	import { periodParams } from '#lib/tournaments/period.js';
	import { ramLabel, ramShorthand } from '#lib/tournaments/ram.js';
	import { legendNames, RAM_PER_LEGEND } from '#lib/tournaments/present.js';
	import { href, withParams } from '#lib/tournaments/url.js';

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
	/** A phone gets the grid squeezed to fit; there the match counts move behind a tap. */
	const phone = new MediaQuery('max-width: 767px');
	let tapped = $state<{ a: string; b: string } | null>(null);
	const detail = $derived(tapped ? cellAt(tapped.a, tapped.b) : undefined);
	const named = (key: string) => {
		const group = groups.find((g) => g.key === key);
		return group ? label(group) : key;
	};
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
			The row's win rate against the column · {meta.crossMatches}
			{data.phase === 'cut' ? 'top cut ' : data.phase === 'swiss' ? 'Swiss ' : ''}matches between
			these {meta.matrixBy === 'ram' ? 'RAMs' : 'sets of Legends'}{meta.crossMatchesTotal >
			meta.crossMatches
				? ` (of ${meta.crossMatchesTotal} between decks of different ${meta.matrixBy === 'ram' ? 'RAMs' : 'sets of Legends'})`
				: ''} · a draw counts half
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<Pills
			label="Rounds"
			options={PHASES}
			value={data.phase}
			href={(key) => withParams(page.url, { rounds: key === 'all' ? null : key })}
		/>
		<Pills
			label="Group by"
			options={BY}
			value={data.by}
			href={(key) => withParams(page.url, { by: key === 'ram' ? null : key })}
		/>
	</div>
</header>

{#if groups.length < 2}
	<p class="mt-8 text-center text-sm text-muted">
		A matrix needs at least two {meta.matrixBy === 'ram' ? 'RAMs' : 'sets of Legends'} with decks; this
		period has {groups.length}.
	</p>
{:else}
	<div class="mt-4 overflow-x-auto md:mt-6">
		<table
			class="mx-auto w-full table-fixed border-separate border-spacing-0.5 text-center md:w-auto md:table-auto md:border-spacing-1.5"
		>
			<thead>
				<tr>
					<th
						class="w-14 text-left font-mono text-[10px] font-normal text-muted uppercase md:w-64 md:text-[11px]"
						><span class="md:hidden">Share</span><span class="hidden md:inline">Deck · share</span
						></th
					>
					{#each groups as group (group.key)}
						<th class="align-bottom font-normal md:w-24">
							<a
								rel="nofollow"
								href={decksOf(group)}
								title="{label(group)}: its decks"
								class="block rounded-lg px-0 py-1.5 hover:bg-shell md:px-1"
							>
								{#if meta.matrixBy === 'ram'}
									<RamCode ram={group.key} class="text-[11px] md:text-base" />
								{:else}
									<span class="mx-auto flex w-full max-w-16 flex-col gap-0.5">
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
								class="flex flex-col items-start gap-0.5 p-1.5 md:flex-row md:items-center md:gap-2 md:p-2.5"
							>
								{#if meta.matrixBy !== 'ram'}
									<span class="flex -space-x-1.5 md:-space-x-2">
										{#each row.legends as slug (slug)}<LegendArt
												{slug}
												sizes="40px"
												class="w-4 ring-1 ring-void md:w-7"
											/>{/each}
									</span>
								{/if}
								<span class="min-w-0">
									{#if meta.matrixBy === 'ram'}
										<RamCode ram={row.key} class="block text-[13px] md:text-base" />
									{:else}
										<span class="hidden truncate text-sm text-bright md:block"
											>{legendNames(row.legends)}</span
										>
									{/if}
									<span class="font-mono text-[10px] text-muted md:text-[11px]"
										>{percent(row.share)}<span class="hidden md:inline">
											· {row.decks} decks</span
										></span
									>
								</span>
							</a>
						</th>
						{#each groups as col (col.key)}
							{@const cell = cellAt(row.key, col.key)}
							{@const on = tapped?.a === row.key && tapped?.b === col.key}
							<td
								class="h-12 rounded-md font-mono md:h-[4.5rem] md:rounded-lg {on
									? 'outline-2 outline-bright'
									: ''}"
								style:background={row.key === col.key
									? 'transparent'
									: background(cell?.winRate ?? null, cell?.matches ?? 0)}
								title="{label(row)} vs {label(col)}: {cell?.matches ?? 0} matches"
							>
								{#if row.key === col.key}
									<span class="text-edge">—</span>
								{:else if cell && cell.matches > 0}
									{#if phone.current}
										<button
											class="size-full text-xs text-bright"
											aria-label="{label(row)} vs {label(col)}: {percent(
												cell.winRate
											)} over {cell.matches} matches"
											onclick={() => (tapped = { a: row.key, b: col.key })}
											>{percent(cell.winRate)}</button
										>
									{:else}
										<span class="text-base text-bright">{percent(cell.winRate)}</span>
										<span class="block text-[11px] text-muted">n={cell.matches}</span>
									{/if}
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

	<!-- Phones only: the match count the cells have no room for, for the cell last tapped. -->
	<p class="mt-3 min-h-10 font-mono text-xs text-muted md:hidden" aria-live="polite">
		{#if tapped && detail}
			<span class="text-bright">{named(tapped.a)}</span> vs
			<span class="text-bright">{named(tapped.b)}</span>:
			<span class="text-bright">{percent(detail.winRate)}</span> over {detail.matches}
			{detail.matches === 1 ? 'match' : 'matches'}
		{:else}
			Tap a cell for the match count behind it.
		{/if}
	</p>
{/if}
