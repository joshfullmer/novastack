<script lang="ts">
	/**
	 * The deckbuilder screen — `docs/spec/deckbuilder.md` §5. Ported from the winning prototype
	 * (`src/routes/prototype/deckbuilder/VariantA.svelte`) and wired to real persistence: state is
	 * seeded from the loaded deck, mutated locally via `#lib/decks/deck-state.svelte.js`, and
	 * saved through the `save` action as one new `deck_versions` row.
	 *
	 * Owner-only — the read-only counterpart other users see is `/decks/[id]`.
	 *
	 * Export (§6) is deliberately absent — sharing/export is Phase 2, not built yet.
	 */
	import { enhance } from '$app/forms';
	import CardHoverPreview from '#lib/components/CardHoverPreview.svelte';
	import CardImage from '#lib/components/CardImage.svelte';
	import { COLOR_TEXT } from '#lib/components/color.js';
	import { dataset } from '#lib/cards/index.js';
	import type { Card } from '#lib/cards/schema.js';
	import { admits } from '#lib/filters/budget.js';
	import { evaluate, type Match, type Predicate } from '#lib/filters/predicate.js';
	import { parseQuery } from '#lib/query/index.js';
	import { DEFAULT_SORT, sortMatches } from '#lib/filters/sort.js';
	import { LEGEND_SLOTS, MAX_DECK_SIZE, MIN_DECK_SIZE } from '#lib/decks/legality.js';
	import { createDeckState } from '#lib/decks/deck-state.svelte.js';
	import { groupDeckEntries } from '#lib/decks/grouping.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';
	import { cookieState } from '#lib/cookie-state.svelte.js';
	import { persistedIntState } from '#lib/persisted-state.svelte.js';

	const legendSlots = Array.from({ length: LEGEND_SLOTS }, (_, index) => index);

	let { data, form } = $props();

	// Deliberately seeded once, not reactive to later `data` updates. After a save, `data.payload`
	// reloads to exactly what was just persisted, so re-seeding would be a no-op there — but
	// re-seeding in general would clobber in-progress local edits with stale server state any
	// time `data` changed for an unrelated reason.
	// svelte-ignore state_referenced_locally
	const deck = createDeckState(data.payload);
	const deckPayload = $derived(JSON.stringify(deck.toPayload()));

	const ALL: Predicate = { kind: 'all' };

	// A deck that already has its 3 Legends opens straight on the Main Deck tab — see
	// `toggleLegend` below for the same rule applied live as Legends are picked/removed.
	let tab = $state<'legends' | 'main'>(deck.legends.length === LEGEND_SLOTS ? 'main' : 'legends');
	let searchLegends = $state('');
	let searchMain = $state('');
	// Shared with the read-only view (`/decks/[id]`) — "how I like browsing a deck's cards" is
	// one preference, not two. Server-rendered from a cookie (`data.deckView`, read in
	// `+page.server.ts`) rather than `localStorage`: this page isn't prerendered, so the server
	// can pick the right branch on the very first render — no flash, and no need to render the
	// other one just in case.
	// svelte-ignore state_referenced_locally
	const deckView = cookieState('deck-cards-view', data.deckView);
	let hovered = $state<{ card: Card; left: number; top: number } | null>(null);

	// Same density control as the card database's own grid, just a different default: this
	// panel is denser to begin with, so 8 (not 6) starts already-comfortable. Persisted
	// separately from `/cards`' own column count — narrower panel, different natural default,
	// not really the same preference.
	const COLUMN_STEP = 2;
	const COLUMN_FLOOR = 2;
	const COLUMN_CEILING = 12;
	const columns = persistedIntState('deck-editor-columns', 8, {
		min: COLUMN_FLOOR,
		max: COLUMN_CEILING
	});
	function setColumns(next: number) {
		columns.value = next;
	}

	// Keeps `--deck-editor-columns` live for `app.html`'s CSS rule
	// (`[data-columns-grid='deck-editor']`), which is the *only* thing setting
	// `grid-template-columns` on that element — see `/cards`' own identical comment for why
	// there's no competing inline `style` binding below to fight over specificity with.
	$effect(() => {
		document.documentElement.style.setProperty('--deck-editor-columns', String(columns.value));
	});

	function matchesFor(source: string): Match[] {
		const trimmed = source.trim();
		const predicate = trimmed === '' ? ALL : parseQuery(trimmed, dataset).predicate;
		return sortMatches(dataset, evaluate(dataset, predicate), DEFAULT_SORT);
	}

	/**
	 * Colors actually present in the deck so far. Building order is deliberately free — cards go
	 * in before Legends do — so the Legends tab filters to "relevant to what's already in the
	 * deck" instead of "affordable," and an empty deck imposes no filter at all.
	 */
	const neededColors = $derived(new Set(deck.entries.map((entry) => entry.card.color)));

	/** Each tab's search runs through the same query language and default sort as `/cards`,
	 * plus its own intrinsic filter. */
	const visibleMatches = $derived.by(() => {
		if (tab === 'legends') {
			return matchesFor(searchLegends)
				.filter((match) => match.card.cardType === 'Legend')
				.filter((match) => isChosenLegend(match.card) || deck.legends.length < LEGEND_SLOTS)
				.filter(
					(match) =>
						neededColors.size === 0 ||
						isChosenLegend(match.card) ||
						neededColors.has(match.card.color)
				);
		}
		// No Legends yet → build freely, capped only by the copy limit. Once at least one
		// Legend is chosen, the grid narrows to what its RAM budget actually supports. A card
		// already at 3 copies stays visible but disabled (see the tile below) rather than
		// disappearing — removing it from the grid mid-click was the jarring bit.
		return matchesFor(searchMain).filter((match) => {
			if (match.card.cardType === 'Legend') return false;
			if (deck.legends.length > 0 && !admits(deck.budget, match.card)) return false;
			return true;
		});
	});

	const mainGroups = $derived(groupDeckEntries(dataset, deck.entries));

	function isChosenLegend(card: Card): boolean {
		return deck.legends.some((legend) => legend.slug === card.slug);
	}

	function toggleLegend(card: Card) {
		// A click swaps what's under the cursor without a fresh `mouseenter`/`mouseleave`, so a
		// stale preview would otherwise keep showing whatever was hovered right before the click.
		hovered = null;
		const slot = deck.legends.findIndex((legend) => legend.slug === card.slug);
		if (slot !== -1) {
			// Removing a Legend — including from the right-hand slot itself — is always a cue to
			// go pick its replacement.
			deck.setLegend(slot, null);
			tab = 'legends';
		} else if (deck.legends.length < LEGEND_SLOTS) {
			deck.setLegend(deck.legends.length, card);
			if (deck.legends.length === LEGEND_SLOTS) tab = 'main';
		}
	}

	const sizeTone = $derived(SIZE_STATUS_TONE[deck.sizeStatus]);

	function onRowEnter(card: Card, event: MouseEvent & { currentTarget: HTMLElement }) {
		const rect = event.currentTarget.getBoundingClientRect();
		hovered = { card, left: rect.left, top: rect.top };
	}

	/** Same staleness risk as `toggleLegend` — a removed row's own preview must not linger. */
	function removeCard(card: Card) {
		hovered = null;
		deck.removeCard(card);
	}
</script>

<svelte:head>
	<title>{data.deckName} — novastack</title>
</svelte:head>

<div
	class="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[1800px] bg-void px-4 sm:px-6"
	style="top: var(--spacing-nav)"
>
	<!-- Browse panel -->
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<div class="flex items-center gap-4 border-b border-edge px-4 pt-3 text-sm">
			<h1 class="mr-2 truncate text-sm font-medium text-bright">{data.deckName}</h1>
			<button
				type="button"
				onclick={() => (tab = 'legends')}
				class="-mb-px border-b-2 px-1 pb-2"
				class:border-neon={tab === 'legends'}
				class:text-neon={tab === 'legends'}
				class:border-transparent={tab !== 'legends'}
				class:text-muted={tab !== 'legends'}
			>
				Legends
			</button>
			<button
				type="button"
				onclick={() => (tab = 'main')}
				class="-mb-px border-b-2 px-1 pb-2"
				class:border-neon={tab === 'main'}
				class:text-neon={tab === 'main'}
				class:border-transparent={tab !== 'main'}
				class:text-muted={tab !== 'main'}
			>
				Main Deck
			</button>
		</div>

		<div class="p-4">
			<input
				type="search"
				value={tab === 'legends' ? searchLegends : searchMain}
				oninput={(event) => {
					const value = event.currentTarget.value;
					if (tab === 'legends') searchLegends = value;
					else searchMain = value;
				}}
				placeholder={tab === 'legends'
					? 'Search legends… (color:red type:legend …)'
					: 'Search cards… (cost<=3 tag:corpo …)'}
				class="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
					placeholder:text-muted focus:border-neon focus:outline-none"
			/>
			{#if tab === 'main'}
				<p class="mt-2 text-xs text-muted">
					Add cards freely — pick Legends after, in the Legends tab, to cover their RAM.
				</p>
			{:else if deck.entries.length > 0}
				<p class="mt-2 text-xs text-muted">
					Filtered to colors already in your deck ({[...neededColors].join(', ')}).
				</p>
			{/if}
		</div>

		<div class="flex items-center gap-3 px-4 pb-2">
			<fieldset>
				<legend class="mb-1 text-xs font-medium tracking-wide text-muted uppercase"
					>Cards per row</legend
				>
				<div class="inline-flex items-center overflow-hidden rounded-md border border-edge text-sm">
					<button
						type="button"
						onclick={() => setColumns(columns.value - COLUMN_STEP)}
						disabled={columns.value <= COLUMN_FLOOR}
						aria-label="Fewer, larger cards"
						class="px-2.5 py-1 text-body hover:bg-raised disabled:opacity-30">−</button
					>
					<span class="w-8 text-center text-xs text-muted tabular-nums">{columns.value}</span>
					<button
						type="button"
						onclick={() => setColumns(columns.value + COLUMN_STEP)}
						disabled={columns.value >= COLUMN_CEILING}
						aria-label="More, smaller cards"
						class="px-2.5 py-1 text-body hover:bg-raised disabled:opacity-30">+</button
					>
				</div>
			</fieldset>
			<p class="text-sm text-muted tabular-nums">{visibleMatches.length} cards</p>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4">
			<ul data-columns-grid="deck-editor" class="grid gap-2">
				{#each visibleMatches as match (match.card.slug)}
					{@const inDeck = deck.quantityOf(match.card)}
					{@const chosen = tab === 'legends' && isChosenLegend(match.card)}
					{@const maxedOut = tab === 'main' && !deck.canAddCopy(match.card)}
					<li class="relative">
						<button
							type="button"
							disabled={maxedOut}
							onclick={() =>
								tab === 'legends' ? toggleLegend(match.card) : deck.addCard(match.card)}
							class="group relative block w-full overflow-hidden rounded-md transition-transform
								hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40
								disabled:hover:-translate-y-0"
							class:ring-2={chosen}
							class:ring-neon={chosen}
						>
							<CardImage
								printingId={match.printing.id}
								thumbhash={match.printing.thumbhash}
								color={match.card.color}
								alt={match.card.name}
								sizes="{Math.round(100 / columns.value)}vw"
							/>
							{#if inDeck > 0}
								<span
									class="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full
										bg-neon text-xs font-bold text-void tabular-nums"
								>
									{inDeck}
								</span>
							{/if}
						</button>
					</li>
				{:else}
					<li class="col-span-full py-8 text-center text-sm text-muted">
						{tab === 'legends'
							? 'No legends match your search, your colors, or there’s no room left.'
							: 'No cards match your search or RAM budget.'}
					</li>
				{/each}
			</ul>
		</div>
	</div>

	<!-- Deck panel -->
	<aside class="flex w-[360px] shrink-0 flex-col border-x border-edge bg-shell">
		<div class="border-b border-edge p-4" role="group" onmouseleave={() => (hovered = null)}>
			<p class="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
				Legends {deck.legends.length}/{LEGEND_SLOTS}
			</p>
			<div class="flex gap-2">
				{#each legendSlots as slot (slot)}
					{@const legend = deck.legends[slot]}
					<button
						type="button"
						disabled={!legend}
						onclick={() => legend && toggleLegend(legend)}
						onmouseenter={(event) => legend && onRowEnter(legend, event)}
						aria-label={legend ? `Remove ${legend.name}` : `Legend slot ${slot + 1}: empty`}
						class="flex size-14 items-center justify-center overflow-hidden rounded-md border
							border-edge disabled:cursor-default"
						class:hover:border-card-red={!!legend}
					>
						{#if legend}
							<CardImage
								printingId={legend.printings[0].id}
								thumbhash={legend.printings[0].thumbhash}
								color={legend.color}
								alt={legend.name}
								sizes="56px"
							/>
						{:else}
							<span class="text-muted">+</span>
						{/if}
					</button>
				{/each}
			</div>
			<p class="mt-2 text-xs text-muted">
				{#each Object.entries(deck.budget) as [color, ram] (color)}
					{#if ram > 0}<span class="mr-2">{color} {ram}</span>{/if}
				{/each}
			</p>
		</div>

		{#if !deck.isRamLegal}
			<div class="border-b border-edge bg-card-red/10 px-4 py-2.5 text-sm text-card-red">
				<p class="font-medium">
					{deck.ramViolations.length}
					{deck.ramViolations.length === 1 ? 'card exceeds' : 'cards exceed'} your Legends’ RAM
				</p>
				<p class="mt-0.5 max-h-16 overflow-y-auto text-xs text-card-red/80">
					{deck.ramViolations.map((entry) => entry.card.name).join(', ')}
				</p>
			</div>
		{/if}

		<div class="flex items-center justify-between border-b border-edge px-4 py-3">
			<span class="text-sm font-medium text-bright">Main Deck</span>
			<div class="flex items-center gap-3">
				<span
					class="text-sm font-medium tabular-nums {sizeTone}"
					title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards"
				>
					{deck.totalCards}
				</span>
				<div class="flex overflow-hidden rounded-md border border-edge text-xs">
					<button
						type="button"
						onclick={() => (deckView.value = 'list')}
						class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
						class:bg-raised={deckView.value === 'list'}
						class:text-bright={deckView.value === 'list'}
						class:text-muted={deckView.value !== 'list'}>List</button
					>
					<button
						type="button"
						onclick={() => (deckView.value = 'gallery')}
						class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
						class:bg-raised={deckView.value === 'gallery'}
						class:text-bright={deckView.value === 'gallery'}
						class:text-muted={deckView.value !== 'gallery'}>Gallery</button
					>
				</div>
			</div>
		</div>

		{#if deckView.value === 'list'}
			<ul class="flex-1 overflow-y-auto" role="list" onmouseleave={() => (hovered = null)}>
				{#each mainGroups as group (group.cardType)}
					<li
						class="flex items-baseline justify-between gap-2 border-b border-edge/50 bg-surface px-4
							py-1 text-xs font-medium tracking-wide text-muted uppercase"
					>
						<span>{group.label}</span>
						<span class="tabular-nums">{group.quantity}</span>
					</li>
					{#each group.entries as entry (entry.card.slug)}
						<li
							class="flex items-center justify-between gap-2 border-b border-edge/50 px-4 py-1.5"
							onmouseenter={(event) => onRowEnter(entry.card, event)}
						>
							<span class="min-w-0 flex-1 truncate text-sm {COLOR_TEXT[entry.card.color]}">
								<span class="mr-1.5 text-muted tabular-nums">{entry.quantity}×</span>{entry.card
									.name}
							</span>
							<button
								type="button"
								onclick={() => removeCard(entry.card)}
								aria-label="Remove one {entry.card.name}"
								class="shrink-0 rounded-md border border-edge px-1.5 text-muted
									transition-colors hover:border-card-red hover:text-card-red">−</button
							>
						</li>
					{/each}
				{:else}
					<li class="p-4 text-sm text-muted">No cards yet. Add some from the left.</li>
				{/each}
			</ul>
		{:else}
			<div class="flex-1 overflow-y-auto p-3">
				{#each mainGroups as group (group.cardType)}
					<p
						class="mt-3 mb-1 px-1 text-xs font-medium tracking-wide text-muted uppercase first:mt-0"
					>
						{group.label} <span class="text-muted/70 tabular-nums">{group.quantity}</span>
					</p>
					<ul class="grid grid-cols-4 gap-2">
						{#each group.entries as entry (entry.card.slug)}
							<li class="relative">
								<button
									type="button"
									onclick={() => removeCard(entry.card)}
									aria-label="Remove one {entry.card.name}"
									class="block w-full overflow-hidden rounded-md"
								>
									<CardImage
										printingId={entry.card.printings[0].id}
										thumbhash={entry.card.printings[0].thumbhash}
										color={entry.card.color}
										alt={entry.card.name}
										sizes="80px"
									/>
									<span
										class="absolute top-1 right-1 flex size-5 items-center justify-center
											rounded-full bg-neon text-xs font-bold text-void tabular-nums"
									>
										{entry.quantity}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="p-4 text-sm text-muted">No cards yet.</p>
				{/each}
			</div>
		{/if}

		<div class="border-t border-edge p-3">
			{#if form?.message}
				<p class="mb-2 text-xs text-card-red">{form.message}</p>
			{/if}
			<!-- `grid-cols-2`, not `flex` + `flex-1` on each child — a `<form>` as a direct
			     `flex-1` sibling doesn't split evenly with a flex-1 sibling (a reproducible
			     browser quirk, verified in isolation) even with identical
			     flex-grow/shrink/basis/min-width. Grid's `minmax(0, 1fr)` tracks size by the
			     container, not by each item's own content, so it isn't exposed to that at all. -->
			<div class="grid grid-cols-2 gap-2">
				<a
					href="/decks/{data.deckId}"
					class="rounded-md border border-edge px-3 py-1.5 text-center text-sm font-medium
						text-body hover:border-card-red hover:text-card-red"
				>
					Discard changes
				</a>
				<form method="POST" action="?/save" use:enhance>
					<input type="hidden" name="payload" value={deckPayload} />
					<button
						type="submit"
						class="w-full rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void
							hover:bg-neon-dim">Save deck</button
					>
				</form>
			</div>
		</div>
	</aside>
</div>

<CardHoverPreview {hovered} />
