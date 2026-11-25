<script lang="ts">
	// Card breakdown: the Cards, not the archetypes. Pick a RAM or a set of Legends (or all decks) and see
	// the Cards people ran, as art: the share of decks that ran each, bottom right, and the copies in a
	// deck that does, bottom left. Each tile opens that Card's usage.
	import { page } from '$app/state';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import Pills from '#lib/components/tournaments/Pills.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { periodParams } from '#lib/tournaments/period.js';
	import { cardName, legendNames } from '#lib/tournaments/present.js';
	import { href, withParams } from '#lib/tournaments/url.js';

	let { data } = $props();

	/** What the grid is ordered by (`?sort=`): the share of decks that ran a card, or how many copies it gets. */
	const sort = $derived(data.sort);
	const SHOWN = 60;

	const cards = $derived(
		[...data.cards]
			.filter((card) => card.decks > 0)
			.sort((a, b) =>
				sort === 'percentage'
					? b.inclusion - a.inclusion || a.slug.localeCompare(b.slug)
					: b.avgCopies - a.avgCopies || b.inclusion - a.inclusion || a.slug.localeCompare(b.slug)
			)
			.slice(0, SHOWN)
	);
	const percent = (n: number) => `${Math.round(n * 100)}%`;
	const mine = (line: string | null, ram: string | null = null) =>
		href('/meta/cards', {
			...periodParams(data.period),
			line,
			ram,
			sort: sort === 'count' ? sort : null
		});
	const all = $derived(data.line === null && data.ram === null);

	const OPTIONS = [
		['percentage', 'Percentage'],
		['count', 'Count']
	] as const;
</script>

<!-- `minmax(0, 1fr)`: a bare `grid` on a phone is one auto-sized column, which grows to its widest child (the
     Legends list) and takes the whole page past the screen with it. -->
<div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
	<aside class="lg:sticky lg:top-20 lg:self-start">
		<h1 class="sr-only">Card breakdown</h1>

		<a
			rel="nofollow"
			href={mine(null)}
			aria-current={all ? 'true' : undefined}
			class="block rounded-lg border px-3 py-1.5 text-sm {all
				? 'border-neon bg-neon/10 text-bright'
				: 'border-edge text-muted hover:text-body'}"
		>
			All decks
		</a>

		<h2 class="mt-4 mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">RAM</h2>
		<div class="flex flex-wrap gap-1.5">
			{#each data.rams as choice (choice.ram)}
				<a
					rel="nofollow"
					href={mine(null, choice.ram)}
					aria-current={data.ram === choice.ram ? 'true' : undefined}
					title="{choice.decks} decks"
					class="flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1 {data.ram === choice.ram
						? 'border-neon bg-neon/10'
						: 'border-edge hover:bg-surface'}"
				>
					<RamCode ram={choice.ram} class="text-sm" />
					<span class="font-mono text-[10px] text-muted">{choice.decks}</span>
				</a>
			{/each}
		</div>

		<h2 class="mt-4 mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">Legends</h2>
		<ul class="space-y-1">
			{#each data.lines as line (line.key)}
				<li>
					<a
						rel="nofollow"
						href={mine(line.key)}
						aria-current={data.line === line.key ? 'true' : undefined}
						title={legendNames(line.legends)}
						class="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 {data.line === line.key
							? 'border-neon bg-neon/10'
							: 'border-edge hover:bg-surface'}"
					>
						<span class="flex shrink-0 -space-x-2">
							{#each line.legends as slug (slug)}<LegendArt
									{slug}
									sizes="40px"
									class="w-5 ring-1 ring-void"
								/>{/each}
						</span>
						<span
							class="min-w-0 flex-1 truncate text-xs {data.line === line.key
								? 'text-bright'
								: 'text-body'}"
						>
							{legendNames(line.legends)}
						</span>
						<span class="font-mono text-[10px] text-muted">{line.decks}</span>
					</a>
				</li>
			{/each}
		</ul>
	</aside>

	<section>
		<div class="mb-4 flex items-center justify-between">
			<p class="font-mono text-xs text-muted">{data.decks} decks · top {cards.length} cards</p>
			<Pills
				label="Order by"
				options={OPTIONS}
				value={sort}
				href={(key) => withParams(page.url, { sort: key === 'percentage' ? null : key })}
			/>
		</div>

		<ul
			class="grid grid-cols-3 gap-3 min-[1800px]:grid-cols-10 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8"
		>
			{#each cards as card (card.slug)}
				<li>
					<a
						href={href(`/meta/cards/${card.slug}`, periodParams(data.period))}
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
								class="absolute bottom-1 left-1 rounded bg-void/85 px-1.5 py-0.5 font-mono text-xs text-bright"
								title="Copies, in a deck that runs it"
							>
								×{card.avgCopies.toFixed(1)}
							</span>
							<span
								class="absolute right-1 bottom-1 rounded bg-void/85 px-1.5 py-0.5 font-mono text-xs text-bright"
								title="Of decks, how many ran it"
							>
								{percent(card.inclusion)}
							</span>
						</span>
						<span class="mt-1.5 block h-1 rounded-full bg-edge/60">
							<span class="block h-1 rounded-full bg-neon" style:width="{card.inclusion * 100}%"
							></span>
						</span>
						<span class="mt-1 block truncate text-[11px] text-body">{cardName(card.slug)}</span>
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
