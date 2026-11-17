<script lang="ts">
	// Every Tournament Deck in the period, filtered and paged on the server: by a Legend it runs, by a RAM,
	// by a card it runs (main or sideboard), by player. The filters are a plain GET form, so a filtered
	// list is a link and works without JavaScript; with it, a choice applies at once and typing applies a
	// beat after the last keystroke. On a wide screen the list is a narrow column and the chosen deck
	// takes the rest, so the list shows only what picks a deck out.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import DeckDetail from '#lib/components/tournaments/DeckDetail.svelte';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import PeriodFields from '#lib/components/tournaments/PeriodFields.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { periodParams } from '#lib/tournaments/period.js';
	import { formatDate, legendNames, RAM_PER_LEGEND } from '#lib/tournaments/present.js';
	import { ramLabel, ramShorthand } from '#lib/tournaments/ram.js';
	import { href, withParams } from '#lib/tournaments/url.js';

	let { data } = $props();
	const filters = $derived(data.filters);
	const shown = $derived(data.rows.length);
	const first = $derived((data.page - 1) * data.perPage + 1);

	const go = (n: number) => withParams(page.url, { page: n === 1 ? null : n });

	// On a wide screen a deck opens in the pane beside the list (`?deck=`, so a link keeps it); a plain
	// click on a narrow one, or a modified click anywhere, still goes to the deck's own page.
	const SPLIT = '(min-width: 1536px)';
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

	// The form as a link: whatever it holds, no empty fields, and back to page 1.
	let form = $state<HTMLFormElement>();
	function apply() {
		if (!form) return;
		const query = new SvelteURLSearchParams();
		for (const [name, value] of new FormData(form)) {
			if (typeof value === 'string' && value !== '') query.set(name, value);
		}
		void goto(`?${query}`, { replace: true, reset: false });
	}
	const TYPING_DELAY = 300;
	let pending: ReturnType<typeof setTimeout> | undefined;
	function typed() {
		clearTimeout(pending);
		pending = setTimeout(apply, TYPING_DELAY);
	}
	$effect(() => () => clearTimeout(pending));

	// The two boxes keep what is being typed, which runs ahead of the results; they follow the address
	// (Back, Clear) only when not being typed in.
	let cardBox = $state<HTMLInputElement>();
	let playerBox = $state<HTMLInputElement>();
	// svelte-ignore state_referenced_locally
	let card = $state(filters.card ?? '');
	// svelte-ignore state_referenced_locally
	let player = $state(filters.player ?? '');
	$effect(() => {
		const [c, p] = [filters.card ?? '', filters.player ?? ''];
		if (document.activeElement !== cardBox) card = c;
		if (document.activeElement !== playerBox) player = p;
	});

	const CONTROL = 'rounded border border-edge bg-shell px-2 py-1.5';
</script>

<header class="border-b border-edge pb-4">
	<div class="flex flex-wrap items-baseline gap-x-4">
		<h1 class="sr-only">All decks</h1>
		<p class="font-mono text-xs text-muted">
			{#if data.total === 0}
				No decks match
			{:else}
				{first}–{first + shown - 1} of {data.total} decks
			{/if}
		</p>
	</div>

	<form
		bind:this={form}
		method="GET"
		onsubmit={() => clearTimeout(pending)}
		class="mt-3 flex flex-wrap items-center gap-2 text-xs"
	>
		<PeriodFields period={data.period} />
		{#if data.deck}<input type="hidden" name="deck" value={data.deck.guid} />{/if}
		<select name="legend" class={CONTROL} aria-label="Legend" onchange={apply}>
			<option value="">Any Legend</option>
			{#each data.legendChoices as legend (legend.slug)}
				<option value={legend.slug} selected={filters.legend === legend.slug}>{legend.name}</option>
			{/each}
		</select>
		<select name="ram" class={CONTROL} aria-label="RAM" onchange={apply}>
			<option value="">Any RAM</option>
			{#each data.rams as choice (choice.ram)}
				<option value={choice.ram} selected={filters.ram === choice.ram}>
					{ramShorthand(choice.ram, RAM_PER_LEGEND) ?? ramLabel(choice.ram)} ({choice.decks})
				</option>
			{/each}
		</select>
		<input
			bind:this={cardBox}
			bind:value={card}
			oninput={typed}
			name="card"
			placeholder="Runs card…"
			class="w-44 {CONTROL}"
			aria-label="Runs card"
		/>
		<input
			bind:this={playerBox}
			bind:value={player}
			oninput={typed}
			name="player"
			placeholder="Player…"
			class="w-36 {CONTROL}"
			aria-label="Player"
		/>
		<select name="sort" class={CONTROL} aria-label="Sort" onchange={apply}>
			<option value="finish" selected={filters.sort === 'finish'}>Best finish</option>
			<option value="recent" selected={filters.sort === 'recent'}>Most recent</option>
		</select>
		<!-- Enter in a box submits the form; with no button, a form of several fields would not. -->
		<button class="sr-only">Filter</button>
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

<div class="mt-4 grid gap-6 2xl:grid-cols-[28rem_minmax(0,1fr)] 2xl:items-start">
	<div class="min-w-0">
		<div
			class="grid grid-cols-[3.25rem_1fr_4.25rem] gap-x-3 px-2 font-mono text-[11px] tracking-wide text-muted uppercase"
			aria-hidden="true"
		>
			<span>Finish</span><span>Deck</span><span class="text-right">W-L-D</span>
		</div>

		<ul class="mt-1 space-y-0.5">
			{#each data.rows as deck (deck.guid)}
				<li>
					<a
						href={href(`/tournaments/decks/${deck.guid}`, periodParams(data.period))}
						onclick={(event) => open(event, deck.guid)}
						aria-current={deck.guid === data.deck?.guid ? 'true' : undefined}
						title="{legendNames(deck.legends)} · {deck.eventName}"
						class="grid grid-cols-[3.25rem_1fr_4.25rem] items-center gap-x-3 rounded-lg px-2 py-2 hover:bg-surface {deck.guid ===
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
									{#if deck.ram}<RamCode ram={deck.ram} class="mr-1.5" />{/if}{formatDate(
										deck.startsAt
									)}
								</span>
							</span>
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
				<span class="text-muted">{data.page} / {data.pages}</span>
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
		class="min-w-0 2xl:sticky 2xl:top-20 2xl:max-h-[calc(100vh-6rem)] 2xl:overflow-y-auto 2xl:rounded-xl 2xl:border 2xl:border-edge 2xl:p-5 {data.deck
			? 'max-2xl:order-first'
			: 'max-2xl:hidden'}"
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
