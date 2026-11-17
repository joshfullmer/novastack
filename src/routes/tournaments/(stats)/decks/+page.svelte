<script lang="ts">
	import PeriodFields from '#lib/components/tournaments/PeriodFields.svelte';
	import { periodParams } from '#lib/tournaments/period.js';
	// Every Tournament Deck in the period, filtered and paged on the server: by a Legend it runs, by a
	// card it runs (main or sideboard), by player. The filters are a plain GET form, so a filtered list
	// is a link, and works without JavaScript.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import DeckDetail from '#lib/components/tournaments/DeckDetail.svelte';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { RAM_PER_LEGEND } from '#lib/tournaments/present.js';
	import { ramLabel, ramShorthand } from '#lib/tournaments/ram.js';
	import { formatDate, legendNames } from '#lib/tournaments/present.js';
	import { href, withParams } from '#lib/tournaments/url.js';

	let { data } = $props();
	const filters = $derived(data.filters);
	const shown = $derived(data.rows.length);
	const first = $derived((data.page - 1) * data.perPage + 1);

	const go = (n: number) => withParams(page.url, { page: n === 1 ? null : n });

	// On a wide screen a deck opens in the pane beside the list (`?deck=`, so a link keeps it); a plain
	// click on a narrow one, or a modified click anywhere, still goes to the deck's own page.
	const SPLIT = '(min-width: 1280px)';
	function open(event: MouseEvent, guid: string) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		if (!window.matchMedia(SPLIT).matches) return;
		event.preventDefault();
		void goto(withParams(page.url, { deck: guid }), { reset: false });
	}

	let pane = $state<HTMLElement>();
	// A deck chosen from further down the list starts at its top.
	$effect(() => {
		void data.deck?.guid;
		pane?.scrollTo(0, 0);
	});
</script>

<div class="grid gap-6 xl:grid-cols-2 xl:items-start">
	<div class="min-w-0">
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
				{#if data.deck}<input type="hidden" name="deck" value={data.deck.guid} />{/if}
				<select
					name="legend"
					class="rounded border border-edge bg-shell px-2 py-1.5"
					aria-label="Legend"
				>
					<option value="">Any Legend</option>
					{#each data.legendChoices as legend (legend.slug)}
						<option value={legend.slug} selected={filters.legend === legend.slug}
							>{legend.name}</option
						>
					{/each}
				</select>
				<select name="ram" class="rounded border border-edge bg-shell px-2 py-1.5" aria-label="RAM">
					<option value="">Any RAM</option>
					{#each data.rams as choice (choice.ram)}
						<option value={choice.ram} selected={filters.ram === choice.ram}>
							{ramShorthand(choice.ram, RAM_PER_LEGEND) ?? ramLabel(choice.ram)} ({choice.decks})
						</option>
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
				<select
					name="sort"
					class="rounded border border-edge bg-shell px-2 py-1.5"
					aria-label="Sort"
				>
					<option value="finish" selected={filters.sort === 'finish'}>Best finish</option>
					<option value="recent" selected={filters.sort === 'recent'}>Most recent</option>
				</select>
				<button class="rounded border border-neon-dim bg-neon/10 px-3 py-1.5 text-neon"
					>Filter</button
				>
				{#if filters.legend || filters.ram || filters.card || filters.player}
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
						onclick={(event) => open(event, deck.guid)}
						aria-current={deck.guid === data.deck?.guid ? 'true' : undefined}
						class="grid grid-cols-[3.5rem_1fr_1fr_4.5rem] items-center gap-x-3 rounded-lg px-2 py-2 hover:bg-surface {deck.guid ===
						data.deck?.guid
							? 'bg-surface ring-1 ring-neon/60'
							: ''}"
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
								<span class="block truncate text-[11px] text-muted">
									{#if deck.ram}<RamCode ram={deck.ram} class="mr-1" />{/if}{legendNames(
										deck.legends
									)}
								</span>
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
					<a
						href={go(data.page - 1)}
						class="rounded border border-edge px-3 py-1.5 hover:text-bright">← Previous</a
					>
				{:else}
					<span></span>
				{/if}
				<span class="text-muted">Page {data.page} of {data.pages}</span>
				{#if data.page < data.pages}
					<a
						href={go(data.page + 1)}
						class="rounded border border-edge px-3 py-1.5 hover:text-bright">Next →</a
					>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	</div>

	<!-- The pane: the open deck on a wide screen. Narrower, a deck chosen from a shared link shows above
     the list, and with none chosen there is nothing to show. -->
	<aside
		bind:this={pane}
		aria-label="Deck"
		class="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:rounded-xl xl:border xl:border-edge xl:p-5 {data.deck
			? 'max-xl:order-first'
			: 'max-xl:hidden'}"
	>
		{#if data.deck}
			<div class="mb-3 flex items-center justify-between font-mono text-xs">
				<a
					href={href(`/tournaments/decks/${data.deck.guid}`, periodParams(data.period))}
					class="text-muted hover:text-body">Open on its own page ↗</a
				>
				<a href={withParams(page.url, { deck: null })} class="text-muted hover:text-body">Close ✕</a
				>
			</div>
			<DeckDetail
				deck={data.deck}
				view={data.deckView}
				layout="pane"
				hrefFor={(guid) => href(`/tournaments/decks/${guid}`, periodParams(data.period))}
				onopen={open}
			/>
		{:else}
			<p class="py-24 text-center text-sm text-muted">Choose a deck to read it here.</p>
		{/if}
	</aside>
</div>
