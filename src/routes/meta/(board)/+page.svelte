<script lang="ts">
	// Tier list: decks ranked by how they perform, S down to D, and within a tier by how much of the field
	// played them. Group by RAM (how players name a deck: YYR), the three Legends together, or each Legend
	// on its own; count every deck, only the top 8, or only the winners. A tier needs MIN_DECKS decks:
	// fewer is noise, so those are listed apart, unranked.
	import { cn } from '#lib/cn.js';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import {
		MIN_DECKS,
		TIER_FLOORS,
		TIER_PRIOR,
		TIERS,
		type GroupStat,
		type Tier
	} from '#lib/tournaments/meta.js';
	import { periodParams } from '#lib/tournaments/period.js';
	import { legendNames, RAM_PER_LEGEND } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();
	const meta = $derived(data.meta);

	let by = $state<'ram' | 'line' | 'legend'>('ram');
	let part = $state<'decks' | 'top8' | 'wins'>('decks');

	const PARTS = [
		['decks', 'All decks'],
		['top8', 'Top 8'],
		['wins', 'Winners']
	] as const;
	const GROUPS = [
		['ram', 'RAM'],
		['line', 'Legends'],
		['legend', 'By Legend']
	] as const;

	/** How strongly each tier's badge reads, S solid down to D faint. Whole class names, for Tailwind. */
	const BADGE: Record<Tier, string> = {
		S: cn('bg-neon text-void'),
		A: cn('bg-neon/70 text-void'),
		B: cn('bg-neon/45 text-bright'),
		C: cn('bg-neon/25 text-bright'),
		D: cn('bg-neon/10 text-body')
	};
	const BAND: Record<Tier, string> = {
		S: `${Math.round(TIER_FLOORS.S * 100)}%+`,
		A: `${Math.round(TIER_FLOORS.A * 100)}–${Math.round(TIER_FLOORS.S * 100)}%`,
		B: `${Math.round(TIER_FLOORS.B * 100)}–${Math.round(TIER_FLOORS.A * 100)}%`,
		C: `${Math.round(TIER_FLOORS.C * 100)}–${Math.round(TIER_FLOORS.B * 100)}%`,
		D: `under ${Math.round(TIER_FLOORS.C * 100)}%`
	};

	const base = $derived.by((): GroupStat[] => {
		if (by === 'line') return meta.byLine;
		if (by === 'legend') return meta.byLegend;
		return meta.byRam;
	});
	/** Who is counted: every deck, only those that made the top 8, or only event winners. */
	const rows = $derived.by(() => {
		// Shares are of the whole field, so the lines past the listed ones still count in the total.
		const total =
			base.reduce((n, g) => n + g[part], 0) + (by === 'line' ? meta.unlisted[part] : 0) || 1;
		return base
			.filter((g) => g[part] > 0)
			.map((g) => ({ ...g, partShare: g[part] / total }))
			.sort((a, b) => b[part] - a[part] || b.decks - a.decks || a.key.localeCompare(b.key));
	});
	const widest = $derived(Math.max(...rows.map((r) => r.partShare), 0.01));
	/** The tiers that have anyone in them, best first, then those with too few decks to rank. */
	const tiers = $derived(
		[...TIERS, null]
			.map((tier) => ({ tier, rows: rows.filter((r) => r.tier === tier) }))
			.filter((group) => group.rows.length > 0)
	);

	const percent = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
	const tone = (rate: number | null) =>
		cn(
			rate === null
				? 'text-muted'
				: rate >= 0.55
					? 'text-card-green'
					: rate <= 0.45
						? 'text-card-red'
						: 'text-body'
		);
	const COLUMNS = 'grid-cols-[minmax(0,1fr)_9rem_3.5rem_4.5rem_4.5rem_3rem]';
</script>

<header class="flex flex-wrap items-end justify-between gap-3 border-b border-edge pb-4">
	<div>
		<h1 class="sr-only">Tier list</h1>
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

{#if tiers.length === 0}
	<p class="p-6 text-center text-sm text-muted">
		No decks with a readable set of Legends in this period.
	</p>
{:else}
	<!-- Two columns on a wide screen: the tiers flow down the first, then the second. -->
	<div class="mt-4 gap-x-8 xl:columns-2">
		{#each tiers as { tier, rows: group } (tier ?? 'unranked')}
			<!-- A tier is one bracket: a rail with its letter on the left, its decks to the right. -->
			<section class="mb-4 flex break-inside-avoid overflow-hidden rounded-xl border border-edge">
				<div
					class="grid w-14 shrink-0 place-items-center text-3xl font-semibold {tier
						? BADGE[tier]
						: 'bg-edge/40 text-muted'}"
					title={tier ? `Win rate ${BAND[tier]}` : `Fewer than ${MIN_DECKS} decks`}
				>
					{tier ?? '?'}
				</div>
				<div class="min-w-0 flex-1">
					<div
						class="grid items-center gap-x-3 border-b border-edge/60 px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted uppercase {COLUMNS}"
					>
						<span class="tracking-normal normal-case"
							>{tier ? `win rate ${BAND[tier]}` : `fewer than ${MIN_DECKS} decks: unranked`}</span
						>
						<span
							>Share of {part === 'decks' ? 'field' : part === 'top8' ? 'top 8' : 'winners'}</span
						>
						<span class="text-right">Win</span>
						<span class="text-right" title="Of its decks, how many reached the top 8">→ Top 8</span>
						<span class="text-right" title="Of its decks, how many won an event">→ Won</span>
						<span class="text-right">Decks</span>
					</div>
					<ol>
						{#each group as row (row.key)}
							<li class="grid items-center gap-x-3 rounded-lg px-3 py-2 odd:bg-shell/60 {COLUMNS}">
								<span class="flex min-w-0 items-center gap-3">
									{#if by === 'ram'}
										<a
											rel="nofollow"
											href={href('/meta/decks', {
												...periodParams(data.period),
												ram: row.key
											})}
											class="text-base hover:underline"
											title="See these decks"
										>
											<RamCode ram={row.key} />
										</a>
									{:else}
										<span class="flex shrink-0 -space-x-3">
											{#each row.legends as slug (slug)}
												<LegendArt
													{slug}
													sizes="64px"
													class="{by === 'legend' ? 'w-10' : 'w-9'} ring-1 ring-void"
												/>
											{/each}
										</span>
										<span class="min-w-0 truncate text-bright">{legendNames(row.legends)}</span>
									{/if}
								</span>
								<span class="flex items-center gap-2">
									<span class="h-2 flex-1 rounded-full bg-edge/50">
										<span
											class="block h-2 rounded-full bg-neon"
											style:width="{(row.partShare / widest) * 100}%"
										></span>
									</span>
									<span class="w-9 text-right font-mono text-xs">{percent(row.partShare)}</span>
								</span>
								{#if row.decks >= MIN_DECKS}
									<span
										class="text-right font-mono text-sm {tone(row.winRate)}"
										title="{row.matches} matches; tiered on {percent(row.power)}"
									>
										{percent(row.winRate)}
									</span>
								{:else}
									<span
										class="text-right font-mono text-xs text-muted"
										title="Fewer than {MIN_DECKS} decks: not enough to quote a rate"
										>n&lt;{MIN_DECKS}</span
									>
								{/if}
								<span class="text-right font-mono text-sm">
									{row.top8}<span class="ml-1 text-[10px] text-muted"
										>{percent(row.top8 / row.decks)}</span
									>
								</span>
								<span class="text-right font-mono text-sm">
									{row.wins}<span class="ml-1 text-[10px] text-muted"
										>{percent(row.wins / row.decks)}</span
									>
								</span>
								<span class="text-right font-mono text-sm text-muted">{row.decks}</span>
							</li>
						{/each}
					</ol>
				</div>
			</section>
		{/each}
	</div>
{/if}

<p class="mt-2 text-xs text-muted">
	Tiers rank how a deck <em>performs</em>, from its match win rate (a draw counts half) pulled
	toward 50% as if it had also played {TIER_PRIOR} even matches, so a few lucky matches can't beat a long
	record. The share bar is how much of the field plays it.
	{#if by === 'ram'}
		A RAM names a deck by the Legends it runs: <RamCode ram="rryyyy" /> is a Yellow, a Yellow and a Red
		Legend, {RAM_PER_LEGEND} RAM each. Decks whose Legends aren't in the card data yet aren't counted.
	{:else if by === 'legend'}
		Each deck counts once per Legend, so shares add up to 300%.
	{:else if meta.unlisted.lines > 0}
		The {meta.byLine.length} most-played sets of Legends. {meta.unlisted.lines} others, with {meta
			.unlisted.decks}
		decks between them, are counted in every share but not listed.
	{/if}
</p>
