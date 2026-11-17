<script lang="ts">
	// Where it fits: no deck list at all. Does the Card show up more among winners and top 8s than across
	// the whole field, and which Legend lines run it (with how many of each line's decks do)? A
	// comparison drawn from fewer than 5 decks is shown as a count only.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { MIN_DECKS } from '#lib/tournaments/meta.js';
	import { legendNames } from '#lib/tournaments/present.js';

	let { data } = $props();
	const usage = $derived(data.usage);

	const buckets = $derived([
		{ label: 'Whole field', ran: usage.decks, of: usage.totalDecks },
		{ label: 'Top 8', ran: usage.top8, of: usage.allTop8 },
		{ label: 'Winners', ran: usage.winners, of: usage.allWinners }
	]);
	const percent = (n: number) => `${Math.round(n * 100)}%`;
</script>

<section>
	<h2 class="mb-3 font-mono text-[11px] tracking-wide text-muted uppercase">
		Does it do better at the top?
	</h2>
	<ul class="space-y-2">
		{#each buckets as bucket (bucket.label)}
			{@const rate = bucket.of ? bucket.ran / bucket.of : 0}
			<li class="grid grid-cols-[6rem_1fr_9rem] items-center gap-3">
				<span class="text-sm">{bucket.label}</span>
				<span class="relative h-5 rounded bg-edge/40">
					<span class="block h-5 rounded bg-neon/80" style:width="{rate * 100}%"></span>
					<span
						class="absolute top-0 h-5 w-px bg-bright/70"
						style:left="{usage.inclusion * 100}%"
						title="Whole-field rate"
					></span>
				</span>
				<span class="font-mono text-xs text-muted">
					{#if bucket.of < MIN_DECKS}
						{bucket.ran} of {bucket.of}
						<span title="Fewer than {MIN_DECKS} decks">(n&lt;{MIN_DECKS})</span>
					{:else}
						{percent(rate)} · {bucket.ran} of {bucket.of}
					{/if}
				</span>
			</li>
		{/each}
	</ul>
	<p class="mt-1 text-[11px] text-muted">The white tick is the whole-field rate.</p>
</section>

<section class="mt-8">
	<h2 class="mb-3 font-mono text-[11px] tracking-wide text-muted uppercase">
		Which Legend lines run it
	</h2>
	<ul class="space-y-2">
		{#each usage.byLine as line (line.line)}
			<li class="grid grid-cols-[14rem_1fr_6rem] items-center gap-3">
				<span class="flex min-w-0 items-center gap-2">
					<span class="flex shrink-0 -space-x-2">
						{#each line.legends as slug (slug)}
							<LegendArt {slug} sizes="40px" class="w-6 ring-1 ring-void" />
						{/each}
					</span>
					<span class="truncate text-xs">{legendNames(line.legends)}</span>
				</span>
				<span class="h-3 rounded bg-edge/40">
					<span class="block h-3 rounded bg-neon/80" style:width="{line.rate * 100}%"></span>
				</span>
				<span class="text-right font-mono text-xs text-muted">{line.withCard} of {line.decks}</span>
			</li>
		{:else}
			<li class="text-sm text-muted">No deck in this period ran it.</li>
		{/each}
	</ul>
	{#if usage.lineCount > usage.byLine.length}
		<p class="mt-2 text-[11px] text-muted">
			The {usage.byLine.length} lines that run it most, of {usage.lineCount}.
		</p>
	{/if}
</section>
