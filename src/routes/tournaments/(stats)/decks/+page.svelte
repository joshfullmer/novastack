<script lang="ts">
	import PeriodFields from '#lib/components/tournaments/PeriodFields.svelte';
	import { periodParams } from '#lib/tournaments/period.js';
	// Every Tournament Deck in the period, filtered and paged on the server: by a Legend it runs, by a
	// card it runs (main or sideboard), by player. The filters are a plain GET form, so a filtered list
	// is a link, and works without JavaScript.
	import { page } from '$app/state';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { formatDate, legendNames } from '#lib/tournaments/present.js';
	import { href, withParams } from '#lib/tournaments/url.js';

	let { data } = $props();
	const filters = $derived(data.filters);
	const shown = $derived(data.rows.length);
	const first = $derived((data.page - 1) * data.perPage + 1);

	const go = (n: number) => withParams(page.url, { page: n === 1 ? null : n });
</script>

<header class="border-b border-edge pb-4">
	<h1 class="font-mono text-xl text-bright">All decks</h1>
	<p class="font-mono text-xs text-muted">
		{#if data.total === 0}
			No decks match
		{:else}
			{first}–{first + shown - 1} of {data.total} decks
		{/if}
	</p>

	<form method="GET" class="mt-4 flex flex-wrap items-center gap-2 text-xs">
		<PeriodFields period={data.period} />
		<select
			name="legend"
			class="rounded border border-edge bg-shell px-2 py-1.5"
			aria-label="Legend"
		>
			<option value="">Any Legend</option>
			{#each data.legendChoices as legend (legend.slug)}
				<option value={legend.slug} selected={filters.legend === legend.slug}>{legend.name}</option>
			{/each}
		</select>
		<input
			name="card"
			value={filters.card ?? ''}
			placeholder="Runs card…"
			class="w-44 rounded border border-edge bg-shell px-2 py-1.5"
			aria-label="Runs card"
		/>
		<input
			name="player"
			value={filters.player ?? ''}
			placeholder="Player…"
			class="w-36 rounded border border-edge bg-shell px-2 py-1.5"
			aria-label="Player"
		/>
		<select name="sort" class="rounded border border-edge bg-shell px-2 py-1.5" aria-label="Sort">
			<option value="finish" selected={filters.sort === 'finish'}>Best finish</option>
			<option value="recent" selected={filters.sort === 'recent'}>Most recent</option>
		</select>
		<button class="rounded border border-neon-dim bg-neon/10 px-3 py-1.5 text-neon">Filter</button>
		{#if filters.legend || filters.card || filters.player}
			<a
				href={href('/tournaments/decks', periodParams(data.period))}
				class="text-muted hover:text-body"
			>
				Clear
			</a>
		{/if}
	</form>
</header>

<div
	class="mt-3 grid grid-cols-[3.5rem_1fr_1fr_4.5rem] gap-x-3 px-2 font-mono text-[11px] tracking-wide text-muted uppercase"
	aria-hidden="true"
>
	<span>Finish</span><span>Deck</span><span>Event</span><span class="text-right">W-L-D</span>
</div>

<ul class="mt-1 space-y-0.5">
	{#each data.rows as deck (deck.guid)}
		<li>
			<a
				href={href(`/tournaments/decks/${deck.guid}`, periodParams(data.period))}
				class="grid grid-cols-[3.5rem_1fr_1fr_4.5rem] items-center gap-x-3 rounded-lg px-2 py-2 hover:bg-surface"
			>
				<span class="font-mono text-sm {deck.rank === 1 ? 'text-neon' : 'text-muted'}">
					{deck.rank}<span class="text-[10px] text-muted">/{deck.playerCount}</span>
				</span>
				<span class="flex min-w-0 items-center gap-2">
					<span class="flex shrink-0 -space-x-2">
						{#each deck.legends as slug (slug)}
							<LegendArt {slug} sizes="40px" class="w-6 ring-1 ring-void" />
						{/each}
					</span>
					<span class="min-w-0">
						<span class="block truncate text-sm text-bright">{deck.player}</span>
						<span class="block truncate text-[11px] text-muted">{legendNames(deck.legends)}</span>
					</span>
				</span>
				<span class="min-w-0">
					<span class="block truncate text-xs text-body">{deck.eventName}</span>
					<span class="font-mono text-[11px] text-muted">{formatDate(deck.startsAt)}</span>
				</span>
				<span class="text-right font-mono text-sm">{deck.wins}-{deck.losses}-{deck.draws}</span>
			</a>
		</li>
	{:else}
		<li class="p-6 text-center text-sm text-muted">No deck matches those filters.</li>
	{/each}
</ul>

{#if data.pages > 1}
	<nav class="mt-6 flex items-center justify-between font-mono text-xs" aria-label="Pages">
		{#if data.page > 1}
			<a href={go(data.page - 1)} class="rounded border border-edge px-3 py-1.5 hover:text-bright"
				>← Previous</a
			>
		{:else}
			<span></span>
		{/if}
		<span class="text-muted">Page {data.page} of {data.pages}</span>
		{#if data.page < data.pages}
			<a href={go(data.page + 1)} class="rounded border border-edge px-3 py-1.5 hover:text-bright"
				>Next →</a
			>
		{:else}
			<span></span>
		{/if}
	</nav>
{/if}
