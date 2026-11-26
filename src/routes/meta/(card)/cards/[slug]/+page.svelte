<script lang="ts">
	// A Card's tournament record: its art and headline numbers, and where it fits. Does it show up more
	// among winners and top 8s than across the whole field, and which RAMs and Legends run it, with what
	// share of each one's decks. Reached from the card breakdown. A comparison drawn from fewer than
	// MIN_DECKS decks is shown as a count only.
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';
	import { metaNoindex } from '#lib/meta/launch.js';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import LegendTrio from '#lib/components/tournaments/LegendTrio.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { MIN_DECKS } from '#lib/tournaments/meta.js';
	import { periodParams } from '#lib/tournaments/period.js';
	import { cardName, legendNames } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();
	const usage = $derived(data.usage);

	const percent = (n: number) => `${Math.round(n * 100)}%`;

	const facts = $derived([
		['In decks', percent(usage.inclusion)],
		['Avg copies', usage.avgCopies.toFixed(1)],
		['Decks', `${usage.decks} / ${usage.totalDecks}`],
		['In sideboard', String(usage.inSide)],
		...(usage.asLegend > 0 ? [['As a Legend', String(usage.asLegend)]] : []),
		['Won an event', String(usage.winners)],
		['Top 8', String(usage.top8)]
	]);
	const buckets = $derived([
		{ label: 'Whole field', ran: usage.decks, of: usage.totalDecks },
		{ label: 'Top 8', ran: usage.top8, of: usage.allTop8 },
		{ label: 'Winners', ran: usage.winners, of: usage.allWinners }
	]);
</script>

<!-- `noindex` until Meta is public, and on any filtered view (`metaNoindex`). -->
<Meta
	title="{cardName(usage.slug)} in tournaments — novastack"
	description="How {cardName(usage.slug)} has done in Cyberpunk TCG tournaments."
	origin={data.origin}
	path={page.url.pathname}
	noindex={metaNoindex(page.url)}
/>

{#snippet rate(share: number, ran: number, of: number)}
	<span class="flex items-center gap-2">
		<span class="h-2 flex-1 rounded-full bg-edge/50">
			<span class="block h-2 rounded-full bg-neon" style:width="{share * 100}%"></span>
		</span>
		<span class="w-9 text-right font-mono text-xs">{percent(share)}</span>
		<span class="w-16 text-right font-mono text-[11px] text-muted">{ran} / {of}</span>
	</span>
{/snippet}

<div class="py-6">
	<a
		href={href('/meta/cards', periodParams(data.period))}
		class="font-mono text-xs text-muted hover:text-body">← Card breakdown</a
	>

	<div class="mt-4 grid gap-8 md:grid-cols-[14rem_1fr]">
		<div>
			<LegendArt slug={usage.slug} sizes="320px" class="w-full shadow-2xl" />
			<h1 class="mt-3 text-lg font-semibold text-bright">{cardName(usage.slug)}</h1>
			<dl class="mt-3 grid grid-cols-2 gap-2 text-sm">
				{#each facts as [label, value] (label)}
					<div class="rounded-lg border border-edge bg-shell p-2">
						<dt class="font-mono text-[10px] tracking-wide text-muted uppercase">{label}</dt>
						<dd class="font-mono text-base text-bright">{value}</dd>
					</div>
				{/each}
			</dl>
		</div>

		<div class="min-w-0 space-y-8">
			<section>
				<h2 class="mb-3 font-mono text-[11px] tracking-wide text-muted uppercase">
					Does it do better at the top?
				</h2>
				<ul class="space-y-2">
					{#each buckets as bucket (bucket.label)}
						{@const share = bucket.of ? bucket.ran / bucket.of : 0}
						<li class="grid grid-cols-[6rem_1fr] items-center gap-3">
							<span class="text-sm">{bucket.label}</span>
							{#if bucket.of < MIN_DECKS}
								<span class="font-mono text-xs text-muted" title="Fewer than {MIN_DECKS} decks">
									{bucket.ran} of {bucket.of} (n&lt;{MIN_DECKS})
								</span>
							{:else}
								{@render rate(share, bucket.ran, bucket.of)}
							{/if}
						</li>
					{/each}
				</ul>
				<p class="mt-2 text-[11px] text-muted">
					The share of each group's decks that ran it. A card that is higher in the top 8 and among
					the winners than in the whole field is doing better at the top.
				</p>
			</section>

			<div class="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<section>
					<h2 class="mb-3 font-mono text-[11px] tracking-wide text-muted uppercase">
						Which RAMs run it
					</h2>
					<ul class="space-y-2">
						{#each usage.byRam as group (group.ram)}
							<li class="grid grid-cols-[5rem_1fr] items-center gap-3">
								<RamCode ram={group.ram} class="text-sm" />
								{@render rate(group.rate, group.withCard, group.decks)}
							</li>
						{:else}
							<li class="text-sm text-muted">No deck in this period ran it.</li>
						{/each}
					</ul>
					{#if usage.ramCount > usage.byRam.length}
						<p class="mt-2 text-[11px] text-muted">
							The {usage.byRam.length} RAMs that run it most, of {usage.ramCount}.
						</p>
					{/if}
				</section>

				<section>
					<h2 class="mb-3 font-mono text-[11px] tracking-wide text-muted uppercase">
						Which Legends run it
					</h2>
					<ul class="space-y-2">
						{#each usage.byLine as line (line.line)}
							<li class="grid grid-cols-[minmax(0,17rem)_1fr] items-center gap-3">
								<span class="flex min-w-0 items-center gap-2" title={legendNames(line.legends)}>
									<LegendTrio
										legends={line.legends}
										artClass="w-6 ring-1 ring-void"
										class="shrink-0 -space-x-2"
									/>
									<span class="truncate text-xs">{legendNames(line.legends)}</span>
								</span>
								{@render rate(line.rate, line.withCard, line.decks)}
							</li>
						{:else}
							<li class="text-sm text-muted">No deck in this period ran it.</li>
						{/each}
					</ul>
					{#if usage.lineCount > usage.byLine.length}
						<p class="mt-2 text-[11px] text-muted">
							The {usage.byLine.length} sets of Legends that run it most, of {usage.lineCount}.
						</p>
					{/if}
				</section>
			</div>
		</div>
	</div>
</div>
