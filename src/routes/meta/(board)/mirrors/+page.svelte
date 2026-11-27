<script lang="ts">
	// Mirror breaker: when two decks with the same Legends (or the same RAM) meet, which Cards does the
	// winner run that the loser does not? Pick a RAM or a set of Legends and read the main deck and the
	// sideboard apart: Cards the winner was likelier to have, and Cards the loser was. Only matches where
	// exactly one side ran a Card count for it (a Card both play cannot explain the result), and each list is
	// ranked by the edge the record proves, not the one it merely shows, so a Card seen four times never
	// outranks one seen forty.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import LegendTrio from '#lib/components/tournaments/LegendTrio.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { THIN_MIRRORS, type MirrorCard } from '#lib/tournaments/mirrors.js';
	import { periodParams } from '#lib/tournaments/period.js';
	import { cardName, legendNames } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();

	const mine = (line: string | null, ram: string | null = null) =>
		href('/meta/mirrors', { ...periodParams(data.period), line, ram });
	const percent = (n: number) => `${Math.round(n * 100)}%`;
	const legendsOf = (key: string) => key.split('+');

	const BOARDS = [
		['main', 'Main deck'],
		['side', 'Sideboard']
	] as const;
	const SIDES = [
		['winning', 'Winners run it more'],
		['losing', 'Losers run it more']
	] as const;
</script>

{#snippet row(card: MirrorCard, side: 'winning' | 'losing')}
	<li>
		<a
			href={href(`/meta/cards/${card.slug}`, periodParams(data.period))}
			title="{cardName(
				card.slug
			)}: in the winner's deck alone in {card.winners} matches, the loser's alone in {card.losers}"
			class="flex items-center gap-3 rounded-lg p-1.5 hover:bg-surface"
		>
			<LegendArt slug={card.slug} sizes="48px" class="w-10 shrink-0" />
			<span class="min-w-0 flex-1">
				<span class="block truncate text-sm text-bright">{cardName(card.slug)}</span>
				<!-- The split matches, divided between the side that ran it and the side that did not. -->
				<span class="mt-1 flex h-1.5 overflow-hidden rounded-full bg-edge/60">
					<span class="block bg-neon" style:width="{card.edge * 100}%" aria-hidden="true"></span>
				</span>
			</span>
			<span class="text-right font-mono text-xs text-muted">
				<span class="block text-bright">{percent(card.edge)}</span>
				<span class="block">{side === 'winning' ? card.winners : card.losers} of {card.split}</span>
			</span>
		</a>
	</li>
{/snippet}

<div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
	<aside class="lg:sticky lg:top-20 lg:self-start">
		<h1 class="sr-only">Mirror breaker</h1>
		<p class="mb-3 font-mono text-[11px] text-muted">Decided mirror matches, most first</p>

		<h2 class="mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">RAM</h2>
		<div class="flex flex-wrap gap-1.5">
			{#each data.rams as choice (choice.key)}
				<a
					rel="nofollow"
					href={mine(null, choice.key)}
					aria-current={data.ram === choice.key && data.line === null ? 'true' : undefined}
					title="{choice.matches} mirror matches"
					class="flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1 {data.ram ===
						choice.key && data.line === null
						? 'border-neon bg-neon/10'
						: 'border-edge hover:bg-surface'}"
				>
					<RamCode ram={choice.key} class="text-sm" />
					<span class="font-mono text-[10px] text-muted">{choice.matches}</span>
				</a>
			{/each}
		</div>

		<h2 class="mt-4 mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">Legends</h2>
		<ul class="space-y-1">
			{#each data.lines as choice (choice.key)}
				<li>
					<a
						rel="nofollow"
						href={mine(choice.key)}
						aria-current={data.line === choice.key ? 'true' : undefined}
						title={legendNames(legendsOf(choice.key))}
						class="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 {data.line === choice.key
							? 'border-neon bg-neon/10'
							: 'border-edge hover:bg-surface'}"
					>
						<LegendTrio
							legends={legendsOf(choice.key)}
							artClass="w-5 ring-1 ring-void"
							class="shrink-0 -space-x-2"
						/>
						<span
							class="min-w-0 flex-1 truncate text-xs {data.line === choice.key
								? 'text-bright'
								: 'text-body'}"
						>
							{legendNames(legendsOf(choice.key))}
						</span>
						<span class="font-mono text-[10px] text-muted">{choice.matches}</span>
					</a>
				</li>
			{/each}
		</ul>
	</aside>

	<section class="min-w-0">
		{#if data.mirrors === null}
			<p class="p-6 text-center text-sm text-muted">
				No two decks with the same Legends have met in this period yet.
			</p>
		{:else}
			{@const mirrors = data.mirrors}
			<p class="mb-1 font-mono text-xs text-muted">
				{mirrors.matches} decided mirror {mirrors.matches === 1 ? 'match' : 'matches'}
				· {data.line === null ? 'the same RAM' : 'the same Legends'} · each Card counted only where one
				deck ran it and the other did not
			</p>
			{#if mirrors.matches < THIN_MIRRORS}
				<p class="mb-4 text-sm text-card-yellow">
					Few mirrors to read so far: treat this as a hint, not a result.
				</p>
			{/if}

			{#each BOARDS as [board, title] (board)}
				<h2 class="mt-6 mb-2 border-b border-edge pb-1 text-sm text-bright">{title}</h2>
				<div class="grid gap-x-8 gap-y-4 md:grid-cols-2">
					{#each SIDES as [side, heading] (side)}
						<div>
							<h3 class="mb-1 font-mono text-[11px] tracking-wide text-muted uppercase">
								{heading}
							</h3>
							<ul>
								{#each mirrors[board][side] as card (card.slug)}
									{@render row(card, side)}
								{:else}
									<li class="p-1.5 text-sm text-muted">Nothing the record proves yet.</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/each}
		{/if}
	</section>
</div>
