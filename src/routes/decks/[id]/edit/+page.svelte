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
	import {
		LEGEND_SLOTS,
		MAX_COPIES,
		MAX_DECK_SIZE,
		MIN_DECK_SIZE,
		SIDEBOARD_SIZE
	} from '#lib/decks/legality.js';
	import { createDeckState } from '#lib/decks/deck-state.svelte.js';
	import { groupDeckEntries, groupMatchesByType } from '#lib/decks/grouping.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';
	import { cookieState } from '#lib/cookie-state.svelte.js';
	import { persistedIntState } from '#lib/persisted-state.svelte.js';

	const legendSlots = Array.from({ length: LEGEND_SLOTS }, (_, index) => index);

	/**
	 * Below `lg`, the desktop side-by-side panes don't fit — the deck panel alone (360px) leaves
	 * next to nothing for browsing. Mobile gets Browse as the primary full-screen view, with Deck
	 * sliding up as a bottom sheet — won over a bottom-tab-switcher alternative that was prototyped
	 * alongside it and reviewed live (same process as the view page's own
	 * `.scratch/decks-view-layout` variant round). Reuses the exact same `browsePanel`/`deckPanel`
	 * snippets the desktop layout renders — no behavioral drift between them, only the chrome
	 * around them differs.
	 */
	let sheetOpen = $state(false);

	/**
	 * `dvh` (used below, and as the pre-hydration/no-JS fallback) tracks the visible viewport in
	 * most cases, but iOS Safari has a known desync bug specifically for `position: fixed`
	 * elements — the fixed box's bottom edge doesn't always resize when a *nested* scroll (as
	 * opposed to a page scroll) triggers the address-bar show/hide animation, leaving a stale gap
	 * the height of the toolbar until something forces a reflow. `visualViewport` fires on every
	 * one of those transitions, so mirroring its live height self-corrects the gap in real time.
	 */
	let viewportHeight = $state<number | null>(null);
	$effect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;
		const update = () => (viewportHeight = viewport.height);
		update();
		viewport.addEventListener('resize', update);
		return () => viewport.removeEventListener('resize', update);
	});
	const shellHeight = $derived(viewportHeight !== null ? `${viewportHeight}px` : '100dvh');

	let { data, form } = $props();

	// Deliberately seeded once, not reactive to later `data` updates. After a save, `data.payload`
	// reloads to exactly what was just persisted, so re-seeding would be a no-op there — but
	// re-seeding in general would clobber in-progress local edits with stale server state any
	// time `data` changed for an unrelated reason.
	// svelte-ignore state_referenced_locally
	const deck = createDeckState(data.payload);
	const deckPayload = $derived(JSON.stringify(deck.toPayload()));

	// Same rename UX as the read-only view (`/decks/[id]`) — click the name, edit inline, blur to
	// save. Its own `?/rename` action (separate from `?/save`) — the name isn't part of the local
	// `deck` session state below, so it shouldn't wait for "Save deck" to persist.
	let renaming = $state(false);
	// svelte-ignore state_referenced_locally
	let renameValue = $state(data.deckName);
	function startRename() {
		renameValue = data.deckName;
		renaming = true;
	}

	const ALL: Predicate = { kind: 'all' };

	// A deck that already has its 3 Legends opens straight on the Main Deck tab — see
	// `toggleLegend` below for the same rule applied live as Legends are picked/removed.
	let tab = $state<'legends' | 'main'>(deck.legends.length === LEGEND_SLOTS ? 'main' : 'legends');
	let searchLegends = $state('');
	let searchMain = $state('');

	/**
	 * Which pile the next click fills. View state, not deck state — the Main Deck tab's card pool
	 * *is* the sideboard's pool (Legends may never be sideboarded, tournament rules §3.4.4), so a
	 * third tab would have been a duplicate of the second one with a different destination. A
	 * toggle says the same thing without the duplication, which is also what the official site's
	 * own builder settled on (`docs/research/sideboards.md` §3).
	 */
	let addTarget = $state<'deck' | 'sideboard'>('deck');
	const targetingSideboard = $derived(tab === 'main' && addTarget === 'sideboard');
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
	const COLUMN_STEP = 1;
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

	/** The Main Deck *browse* grid groups by type too, same order/labels/sort as the already-added
	 * list above (Cost → Color → Name within each group). Legends tab is unaffected — it's a
	 * single type already, so grouping it would be a no-op there anyway. */
	const mainMatchGroups = $derived(
		tab === 'main' ? groupMatchesByType(dataset, visibleMatches) : []
	);

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

	/** Deck size deliberately excluded — a deck under construction is supposed to sit outside
	 * 40–50 most of the time (§4), and this screen already shows a live, persistent size readout
	 * below; repeating it here as an "issue" would flag the common case as an error. RAM and
	 * Legend-name conflicts are real mistakes regardless of how far along the deck is. */
	const editorIssues = $derived(deck.issues.filter((issue) => issue.kind !== 'size'));

	function onRowEnter(card: Card, event: MouseEvent & { currentTarget: HTMLElement }) {
		const rect = event.currentTarget.getBoundingClientRect();
		hovered = { card, left: rect.left, top: rect.top };
	}

	/** Same staleness risk as `toggleLegend` — a removed row's own preview must not linger. */
	function removeCard(card: Card) {
		hovered = null;
		deck.removeCard(card);
	}

	function removeFromSideboard(card: Card) {
		hovered = null;
		deck.removeFromSideboard(card);
	}
</script>

<svelte:head>
	<title>{data.deckName} — novastack</title>
</svelte:head>

{#snippet browsePanel()}
	<!-- `items-baseline`, not `items-center` — the tabs carry a `pb-2`/`-mb-px` underline trick the
	     title doesn't, so the two have different box heights; centering different-height boxes
	     still leaves their *text* sitting at different heights. Baseline alignment is immune to
	     that, since it aligns the text itself rather than the padding/border box around it. -->
	<div class="flex items-baseline gap-4 border-b border-edge px-4 pt-3 text-sm">
		{#if renaming}
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => {
					renaming = false;
				}}
				class="mr-2 max-w-[40%] min-w-0"
			>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					name="name"
					bind:value={renameValue}
					onkeydown={(event) => {
						if (event.key === 'Escape') renaming = false;
					}}
					onblur={(event) => event.currentTarget.form?.requestSubmit()}
					class="w-full rounded border border-edge bg-void px-1.5 py-0.5 text-sm font-medium
						text-bright"
					autofocus
				/>
			</form>
		{:else}
			<button
				type="button"
				onclick={startRename}
				class="mr-2 truncate text-left text-sm font-medium text-bright hover:text-neon"
				>{data.deckName}</button
			>
		{/if}
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

	<div class="flex items-center gap-2 p-4">
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
			class="min-w-0 flex-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
				placeholder:text-muted focus:border-neon focus:outline-none"
		/>
		<!-- Beside the search box rather than above the grid: it changes what a click *does*, so it
		     belongs with the other controls that shape the grid, not buried in the deck panel where
		     the clicks don't happen. -->
		{#if tab === 'main'}
			<div
				class="flex shrink-0 overflow-hidden rounded-md border border-edge text-xs"
				role="group"
				aria-label="Where added cards go"
			>
				<button
					type="button"
					onclick={() => (addTarget = 'deck')}
					aria-pressed={addTarget === 'deck'}
					class="px-2.5 py-1.5 transition-colors hover:bg-raised/60 hover:text-bright"
					class:bg-raised={addTarget === 'deck'}
					class:text-bright={addTarget === 'deck'}
					class:text-muted={addTarget !== 'deck'}>Deck</button
				>
				<button
					type="button"
					onclick={() => (addTarget = 'sideboard')}
					aria-pressed={addTarget === 'sideboard'}
					title="Add cards to the sideboard"
					class="border-l border-edge px-2.5 py-1.5 whitespace-nowrap transition-colors
						hover:bg-raised/60 hover:text-bright"
					class:bg-raised={addTarget === 'sideboard'}
					class:text-bright={addTarget === 'sideboard'}
					class:text-muted={addTarget !== 'sideboard'}
				>
					Sideboard <span class="tabular-nums">{deck.sideboardCards}/{SIDEBOARD_SIZE}</span>
				</button>
			</div>
		{/if}
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4">
		<!-- Non-sticky and small by design, matching `/cards`' own identical control — glanced at,
		     not referenced while scrolling, so it scrolls away with the grid instead of pinning a
		     second bar above it. -->
		<div class="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
			<div class="flex items-center gap-2">
				<span class="tracking-wide uppercase">Per row</span>
				<div class="inline-flex items-center overflow-hidden rounded-md border border-edge">
					<button
						type="button"
						onclick={() => setColumns(columns.value - COLUMN_STEP)}
						disabled={columns.value <= COLUMN_FLOOR}
						aria-label="Fewer, larger cards"
						class="px-2 py-0.5 text-body hover:bg-raised disabled:opacity-30">−</button
					>
					<span class="w-6 text-center tabular-nums">{columns.value}</span>
					<button
						type="button"
						onclick={() => setColumns(columns.value + COLUMN_STEP)}
						disabled={columns.value >= COLUMN_CEILING}
						aria-label="More, smaller cards"
						class="px-2 py-0.5 text-body hover:bg-raised disabled:opacity-30">+</button
					>
				</div>
			</div>
			<p class="shrink-0 tabular-nums">{visibleMatches.length} cards</p>
		</div>

		<ul data-columns-grid="deck-editor" class="grid gap-2">
			{#if tab === 'main'}
				{#each mainMatchGroups as group (group.cardType)}
					<li
						class="col-span-full mt-2 rounded-md bg-raised px-3 py-1.5 text-xs tracking-wide
							uppercase first:mt-0"
					>
						<span class="font-semibold text-bright">{group.label}</span>
						<span class="text-muted tabular-nums">({group.matches.length})</span>
					</li>
					{#each group.matches as match (match.card.slug)}
						{@render cardTile(match)}
					{/each}
				{:else}
					<li class="col-span-full py-8 text-center text-sm text-muted">
						No cards match your search or RAM budget.
					</li>
				{/each}
			{:else}
				{#each visibleMatches as match (match.card.slug)}
					{@render cardTile(match)}
				{:else}
					<li class="col-span-full py-8 text-center text-sm text-muted">
						No legends match your search, your colors, or there’s no room left.
					</li>
				{/each}
			{/if}
		</ul>
	</div>
{/snippet}

{#snippet cardTile(match: Match)}
	<!-- The badge counts the pile you're currently filling, so it always answers "how many more of
	     these can I put where I'm putting them". -->
	{@const inDeck = targetingSideboard
		? deck.sideboardQuantityOf(match.card)
		: deck.quantityOf(match.card)}
	{@const chosen = tab === 'legends' && isChosenLegend(match.card)}
	{@const sideboardFull = deck.sideboardCards >= SIDEBOARD_SIZE}
	{@const maxedOut =
		tab === 'main' &&
		!(targetingSideboard ? deck.canAddToSideboard(match.card) : deck.canAddCopy(match.card))}
	<li class="relative">
		<button
			type="button"
			disabled={maxedOut}
			title={maxedOut
				? targetingSideboard && sideboardFull
					? `The sideboard is full at ${SIDEBOARD_SIZE} cards.`
					: `All ${MAX_COPIES} copies are already here (main deck and sideboard combined).`
				: undefined}
			onclick={() =>
				tab === 'legends'
					? toggleLegend(match.card)
					: targetingSideboard
						? deck.addToSideboard(match.card)
						: deck.addCard(match.card)}
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
				<!-- Same chamfered-corner clip as the Eddiable "€$" badge (`CardStats.svelte`) — see
					the deck view's own quantity badge for the two-layer rationale. -->
				<span
					class="absolute bottom-1 left-1/2 isolate inline-flex size-6 -translate-x-1/2 items-center justify-center"
				>
					<span class="absolute inset-0 bg-bright eddie-badge"></span>
					<span class="absolute inset-[2px] bg-void eddie-badge-inset"></span>
					<span class="relative z-10 text-sm font-black text-bright tabular-nums">×{inDeck}</span>
				</span>
			{/if}
		</button>
	</li>
{/snippet}

{#snippet deckPanel()}
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

	{#if editorIssues.length > 0}
		<div
			class="max-h-24 overflow-y-auto border-b border-edge bg-card-red/10 px-4 py-2.5 text-sm
				text-card-red"
		>
			<ul class="space-y-1">
				{#each editorIssues as issue (issue.kind + issue.message)}
					<li>{issue.message}</li>
				{/each}
			</ul>
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
					class="flex items-baseline justify-between gap-2 border-b border-edge/50 bg-raised px-4
						py-1.5 text-xs tracking-wide uppercase"
				>
					<span class="font-semibold text-bright">{group.label}</span>
					<span class="text-muted tabular-nums">{group.quantity}</span>
				</li>
				{#each group.entries as entry (entry.card.slug)}
					<li
						class="flex items-center justify-between gap-2 border-b border-edge/50 px-4 py-1.5"
						onmouseenter={(event) => onRowEnter(entry.card, event)}
					>
						<span class="min-w-0 flex-1 truncate text-sm {COLOR_TEXT[entry.card.color]}">
							<span class="mr-1.5 text-muted tabular-nums">{entry.quantity}×</span>{entry.card.name}
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
					class="mt-3 mb-1.5 rounded-md bg-raised px-3 py-1.5 text-xs tracking-wide uppercase
						first:mt-0"
				>
					<span class="font-semibold text-bright">{group.label}</span>
					<span class="text-muted tabular-nums">{group.quantity}</span>
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
								<!-- Same chamfered-corner clip as the Eddiable "€$" badge (`CardStats.svelte`)
									— see the deck view's own quantity badge for the two-layer rationale. -->
								<span
									class="absolute bottom-1 left-1/2 isolate inline-flex size-6 -translate-x-1/2 items-center justify-center"
								>
									<span class="absolute inset-0 bg-bright eddie-badge"></span>
									<span class="absolute inset-[2px] bg-void eddie-badge-inset"></span>
									<span class="relative z-10 text-sm font-black text-bright tabular-nums">
										×{entry.quantity}
									</span>
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

	<!-- Its own section rather than a fourth type group inside the list above: the rules treat the 7
	     as a separate section of the decklist (§4.1 has judges verify each "independently of the
	     other"). It renders in whichever mode the List/Gallery toggle is set to, same as the main
	     deck. `shrink-0` so the main-deck list gives up the space instead — the sideboard is short
	     and fixed, that isn't. -->
	<div
		class="shrink-0 border-t-2 border-edge bg-void/40"
		onmouseleave={() => (hovered = null)}
		role="group"
	>
		<div class="flex items-center justify-between px-4 py-2.5">
			<span class="text-sm font-medium text-bright">Sideboard</span>
			<span
				class="text-sm font-medium tabular-nums {deck.sideboardStatus === 'legal'
					? 'text-neon'
					: 'text-muted'}"
				title="A constructed sideboard is exactly {SIDEBOARD_SIZE} cards"
			>
				{deck.sideboardCards}/{SIDEBOARD_SIZE}
			</span>
		</div>
		{#if deck.sideboard.length === 0}
			<p class="border-t border-edge/50 px-4 py-2.5 text-xs text-muted">
				Empty — legal, but you'll want {SIDEBOARD_SIZE} to play constructed. Switch the toggle above the
				grid to <span class="text-body">Sideboard</span> to add them.
			</p>
		{:else if deckView.value === 'list'}
			<!-- Follows the same List/Gallery toggle the main deck above uses — one preference for
			     "how I like reading a deck's cards", not one per pile. Rows match the main deck's
			     exactly, including the hover preview and the `−` button. -->
			<ul class="border-t border-edge/50" role="list">
				{#each deck.sideboard as entry (entry.card.slug)}
					<li
						class="flex items-center justify-between gap-2 border-b border-edge/50 px-4 py-1.5
							last:border-b-0"
						onmouseenter={(event) => onRowEnter(entry.card, event)}
					>
						<span class="min-w-0 flex-1 truncate text-sm {COLOR_TEXT[entry.card.color]}">
							<span class="mr-1.5 text-muted tabular-nums">{entry.quantity}×</span>{entry.card.name}
						</span>
						<button
							type="button"
							onclick={() => removeFromSideboard(entry.card)}
							aria-label="Remove one {entry.card.name} from the sideboard"
							class="shrink-0 rounded-md border border-edge px-1.5 text-muted transition-colors
								hover:border-card-red hover:text-card-red">−</button
						>
					</li>
				{/each}
			</ul>
		{:else}
			<!-- Click removes one, same gesture as the main deck's own Gallery mode. -->
			<ul class="grid grid-cols-4 gap-2 border-t border-edge/50 p-3" role="list">
				{#each deck.sideboard as entry (entry.card.slug)}
					<li class="relative">
						<button
							type="button"
							onclick={() => removeFromSideboard(entry.card)}
							onmouseenter={(event) => onRowEnter(entry.card, event)}
							aria-label="Remove one {entry.card.name} from the sideboard"
							class="block w-full overflow-hidden rounded-md"
						>
							<CardImage
								printingId={entry.card.printings[0].id}
								thumbhash={entry.card.printings[0].thumbhash}
								color={entry.card.color}
								alt={entry.card.name}
								sizes="80px"
							/>
							{#if entry.quantity > 1}
								<!-- Same chamfered badge as the main-deck gallery above, but only past one
								     copy. That gallery does badge `×1`; repeating it on five of seven tiles
								     here would bury the one number that carries information — a 2× or 3× of
								     a matchup card — and the `n/7` header already gives the total. -->
								<span
									class="absolute bottom-1 left-1/2 isolate inline-flex size-6 -translate-x-1/2
										items-center justify-center"
								>
									<span class="absolute inset-0 bg-bright eddie-badge"></span>
									<span class="absolute inset-[2px] bg-void eddie-badge-inset"></span>
									<span class="relative z-10 text-sm font-black text-bright tabular-nums">
										×{entry.quantity}
									</span>
								</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

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
{/snippet}

<!-- Desktop: unchanged side-by-side panes, `lg:` and up only. `height` (not `bottom-0`) tracks
     the viewport — `position: fixed` + `bottom: 0` anchors to the *large* viewport (browser
     chrome collapsed) on mobile, which sits below the visible area whenever the address bar is
     showing, so the bottom edge is offscreen until a scroll happens to collapse it. -->
<div
	class="fixed inset-x-0 z-20 mx-auto hidden max-w-[1800px] bg-void px-4 sm:px-6 lg:flex"
	style="top: var(--spacing-nav); height: calc({shellHeight} - var(--spacing-nav));"
>
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		{@render browsePanel()}
	</div>
	<aside class="flex w-[360px] shrink-0 flex-col border-x border-edge bg-shell">
		{@render deckPanel()}
	</aside>
</div>

<!-- Mobile (below `lg`): Browse full-screen, Deck as a bottom sheet — see the layout doc comment
     above. Same viewport-height fix as the desktop container. -->
<div
	class="fixed inset-x-0 z-20 flex flex-col bg-void lg:hidden"
	style="top: var(--spacing-nav); height: calc({shellHeight} - var(--spacing-nav));"
>
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		{@render browsePanel()}
	</div>
	<button
		type="button"
		onclick={() => (sheetOpen = true)}
		class="flex shrink-0 items-center justify-between border-t border-edge bg-shell px-4 py-3"
	>
		<span class="text-sm font-medium text-bright">
			Deck · <span class={sizeTone}>{deck.totalCards}</span> cards{#if deck.sideboardCards > 0}
				· <span class="tabular-nums">{deck.sideboardCards}/{SIDEBOARD_SIZE}</span> sideboard{/if}
		</span>
		<span class="text-muted">▲</span>
	</button>
	{#if sheetOpen}
		<div
			class="fixed inset-x-0 top-0 z-30 flex flex-col justify-end bg-void/70"
			style="height: {shellHeight}"
			onclick={() => (sheetOpen = false)}
			role="presentation"
		>
			<div
				role="dialog"
				aria-label="Deck"
				tabindex="-1"
				onclick={(event) => event.stopPropagation()}
				onkeydown={(event) => event.key === 'Escape' && (sheetOpen = false)}
				class="flex max-h-[85vh] flex-col rounded-t-2xl border-t border-edge bg-shell"
			>
				<button
					type="button"
					aria-label="Close deck panel"
					onclick={() => (sheetOpen = false)}
					class="flex shrink-0 items-center justify-center py-2"
				>
					<span class="h-1 w-10 rounded-full bg-edge"></span>
				</button>
				<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
					{@render deckPanel()}
				</div>
			</div>
		</div>
	{/if}
</div>

<CardHoverPreview {hovered} />
