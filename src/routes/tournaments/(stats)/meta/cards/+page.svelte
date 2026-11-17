<script lang="ts">
	// What's played: the Cards, not the archetypes. Pick a Legend line (or all decks) and see the Cards
	// people ran, as art, with the share of decks that included each. Each tile opens that Card's usage.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { cardName, legendNames } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();

	let sort = $state<'inclusion' | 'copies'>('inclusion');
	const SHOWN = 48;

	const cards = $derived(
		[...data.cards]
			.filter((card) => card.decks > 0)
			.sort((a, b) =>
				sort === 'inclusion'
					? b.inclusion - a.inclusion || a.slug.localeCompare(b.slug)
					: b.avgCopies - a.avgCopies || b.inclusion - a.inclusion || a.slug.localeCompare(b.slug)
			)
			.slice(0, SHOWN)
	);
	const percent = (n: number) => `${Math.round(n * 100)}%`;
	const mine = (line: string | null) =>
		href('/tournaments/meta/cards', { period: data.period.id, line });
</script>

<div class="grid gap-6 lg:grid-cols-[17rem_1fr]">
	<aside class="lg:sticky lg:top-20 lg:self-start">
		<h1 class="mb-3 font-mono text-xl text-bright">What's played</h1>
		<ul class="space-y-1">
			<li>
				<a
					href={mine(null)}
					aria-current={data.line === null ? 'true' : undefined}
					class="block rounded-lg border px-3 py-2 text-sm {data.line === null
						? 'border-neon bg-neon/10 text-bright'
						: 'border-edge text-muted hover:text-body'}"
				>
					All decks
				</a>
			</li>
			{#each data.lines as line (line.key)}
				<li>
					<a
						href={mine(line.key)}
						aria-current={data.line === line.key ? 'true' : undefined}
						class="flex items-center gap-2 rounded-lg border px-3 py-2 {data.line === line.key
							? 'border-neon bg-neon/10'
							: 'border-edge hover:bg-surface'}"
					>
						<span class="flex -space-x-2">
							{#each line.legends as slug (slug)}<LegendArt
									{slug}
									sizes="40px"
									class="w-6 ring-1 ring-void"
								/>{/each}
						</span>
						<span
							class="min-w-0 flex-1 truncate text-xs {data.line === line.key
								? 'text-bright'
								: 'text-body'}"
						>
							{legendNames(line.legends)}
						</span>
						<span class="font-mono text-xs text-muted">{line.decks}</span>
					</a>
				</li>
			{/each}
		</ul>
	</aside>

	<section>
		<div class="mb-4 flex items-center justify-between">
			<p class="font-mono text-xs text-muted">{data.decks} decks · top {cards.length} cards</p>
			<div
				class="flex rounded-full border border-edge p-0.5 font-mono text-xs"
				role="group"
				aria-label="Sort"
			>
				{#each [['inclusion', 'In most decks'], ['copies', 'Most copies']] as const as [key, label] (key)}
					<button
						class="rounded-full px-3 py-1 {sort === key
							? 'bg-neon text-void'
							: 'text-muted hover:text-body'}"
						aria-pressed={sort === key}
						onclick={() => (sort = key)}>{label}</button
					>
				{/each}
			</div>
		</div>

		<ul class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
			{#each cards as card (card.slug)}
				<li>
					<a
						href={href(`/tournaments/cards/${card.slug}`, { period: data.period.id })}
						title="{cardName(
							card.slug
						)}: in {card.decks} of {data.decks} decks, {card.avgCopies.toFixed(
							1
						)} copies on average, in {card.sideDecks} sideboards"
						class="block"
					>
						<span class="relative block">
							<LegendArt slug={card.slug} sizes="180px" />
							<span
								class="absolute right-1 bottom-1 rounded bg-void/85 px-1.5 py-0.5 font-mono text-xs text-bright"
							>
								{percent(card.inclusion)}
							</span>
						</span>
						<span class="mt-1.5 block h-1 rounded-full bg-edge/60">
							<span class="block h-1 rounded-full bg-neon" style:width="{card.inclusion * 100}%"
							></span>
						</span>
						<span class="mt-1 block truncate text-[11px] text-body">{cardName(card.slug)}</span>
						<span class="font-mono text-[10px] text-muted">×{card.avgCopies.toFixed(1)}</span>
					</a>
				</li>
			{:else}
				<li class="col-span-full p-6 text-center text-sm text-muted">
					No main-deck cards in this period.
				</li>
			{/each}
		</ul>
	</section>
</div>
