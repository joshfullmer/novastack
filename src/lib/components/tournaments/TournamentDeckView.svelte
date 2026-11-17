<script lang="ts">
	// A Tournament Deck's cards, drawn the way a saved deck's are (`/d/[code]`): the card being pointed at
	// large beside the list, the cards by type as a table, art or piles, the sideboard framed apart, the
	// price, and the deck's curve (a bar picks that cost), colours and rarities. The same components, so
	// the two views of a deck cannot drift. A tournament deck is a list of card slugs and counts, resolved
	// here through the card dataset; a line the dataset does not know is left out (and `unresolved`
	// already says so). It can be exported, imaged, or opened as a deck of your own.
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { dataset } from '#lib/cards/index.js';
	import type { Card } from '#lib/cards/schema.js';
	import DeckExportDialog from '#lib/components/DeckExportDialog.svelte';
	import DeckImageDialog from '#lib/components/DeckImageDialog.svelte';
	import DeckPrice from '#lib/components/DeckPrice.svelte';
	import DeckCardList from '#lib/components/deck/DeckCardList.svelte';
	import DeckPreview from '#lib/components/deck/DeckPreview.svelte';
	import DeckSideboard from '#lib/components/deck/DeckSideboard.svelte';
	import DeckStats from '#lib/components/deck/DeckStats.svelte';
	import ViewToggle from '#lib/components/deck/ViewToggle.svelte';
	import { cookieState } from '#lib/cookie-state.svelte.js';
	import { clearDraft, isEmptyDraft, loadDraft, storeDraft } from '#lib/decks/draft.js';
	import { deckToJson, deckToMeleeFormat, deckToOfficialFormat } from '#lib/decks/export.js';
	import { groupDeckEntries } from '#lib/decks/grouping.js';
	import { MAX_COPIES, SIDEBOARD_SIZE, type DeckEntry } from '#lib/decks/legality.js';
	import { atCost, type CostPick } from '#lib/decks/stats.js';
	import { DECK_VIEWS, type DeckView } from '#lib/decks/view.js';
	import type { DeckDetail } from '#lib/tournaments/deck-views.js';
	import { cardOf } from '#lib/tournaments/present.js';

	let {
		deck,
		view,
		layout = 'page',
		rail
	}: {
		deck: DeckDetail;
		/** The visitor's choice of view, read from its cookie on the server. */
		view: DeckView;
		/** `page` sets the preview, list and stats side by side; `pane` fits half a screen. */
		layout?: 'page' | 'pane';
		/** Extra for the pane's narrow rail, below the preview (the path through the event). */
		rail?: Snippet;
	} = $props();

	// Shared with the saved deck's page and the editor: how I like browsing a deck's cards is one preference.
	// svelte-ignore state_referenced_locally
	const choice = cookieState('deck-cards-view', view);

	const entriesOf = (cards: { slug: string; quantity: number }[]): DeckEntry[] =>
		cards.flatMap(({ slug, quantity }) => {
			const card = cardOf(slug);
			return card ? [{ card, quantity }] : [];
		});
	const sum = (entries: readonly DeckEntry[]) => entries.reduce((n, e) => n + e.quantity, 0);

	const legends = $derived(deck.legends.flatMap((slug) => cardOf(slug) ?? []));
	const main = $derived(entriesOf(deck.main));
	const side = $derived(entriesOf(deck.side));
	// Every card, for export and the image; only the picked cost, for the list.
	const allGroups = $derived(groupDeckEntries(dataset, main));
	let pick = $state<CostPick>(null);
	const groups = $derived(groupDeckEntries(dataset, atCost(main, pick)));
	const mainCards = $derived(sum(main));
	const sideCards = $derived(sum(side));
	const priced = $derived([...legends.map((card) => ({ card, quantity: 1 })), ...main, ...side]);

	let focused = $state<Card | null>(null);
	let cardsColumn = $state<HTMLElement>();
	let railColumn = $state<HTMLElement>();
	// A different deck starts from its own first card and its whole list, scrolled to the top, not where
	// the last one was left.
	$effect(() => {
		void deck.guid;
		focused = null;
		pick = null;
		cardsColumn?.scrollTo(0, 0);
		railColumn?.scrollTo(0, 0);
	});
	const shown = $derived(focused ?? legends[0] ?? main[0]?.card ?? null);

	const name = $derived(`${deck.player} · ${deck.eventName}`.slice(0, 100));

	// A deck of your own to edit: a local draft, which is what the builder opens on. It is the same
	// whether or not you are signed in (signing in is asked for at Save), and it is only ever one, so a
	// draft already in progress is asked about before it is replaced.
	function openAsNewDeck() {
		const existing = loadDraft();
		if (
			existing &&
			!isEmptyDraft(existing) &&
			!confirm('Replace the deck you have in progress? It is kept only in this browser.')
		)
			return;
		clearDraft();
		storeDraft({
			name,
			payload: {
				legends: legends.map((card) => ({ cardSlug: card.slug })),
				entries: main.map(({ card, quantity }) => ({
					cardSlug: card.slug,
					quantity: Math.min(quantity, MAX_COPIES)
				})),
				sideboard: side.map(({ card, quantity }) => ({
					cardSlug: card.slug,
					quantity: Math.min(quantity, MAX_COPIES)
				}))
			},
			bookmarks: [],
			guide: ''
		});
		void goto(resolve('/decks/new'));
	}
</script>

<!-- In the deck list's pane on a wide screen the cards and the rail each scroll in the height the pane
     has; anywhere else the page scrolls. -->
<div
	class="grid gap-6 {layout === 'page'
		? 'lg:grid-cols-[240px_1fr_280px]'
		: 'lg:grid-cols-[minmax(0,1fr)_16rem] 2xl:h-full 2xl:min-h-0 2xl:grid-rows-[minmax(0,1fr)]'}"
>
	{#if layout === 'page'}
		<div class="hidden lg:sticky lg:top-6 lg:block lg:self-start">
			<DeckPreview card={shown} />
		</div>
	{/if}

	<div
		bind:this={cardsColumn}
		class="min-w-0 {layout === 'pane' ? '2xl:min-h-0 2xl:overflow-y-auto' : ''}"
	>
		<div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
				<p class="text-sm text-muted tabular-nums">
					<span class="font-medium text-bright">{mainCards}</span> cards
					{#if sideCards > 0}
						· <span class="font-medium text-bright">{sideCards}/{SIDEBOARD_SIZE}</span> sideboard
					{/if}
				</p>
				{#if pick}
					<button
						type="button"
						onclick={() => (pick = null)}
						class="rounded-full border border-neon-dim px-2.5 py-0.5 font-mono text-[11px] text-neon hover:bg-neon/10"
						title="Show every card again"
					>
						cost {pick.cost ?? '—'} ✕
					</button>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<DeckExportDialog
					deckName={name}
					textFor={(id) =>
						id === 'default'
							? deckToOfficialFormat(name, legends, allGroups, side)
							: id === 'melee'
								? deckToMeleeFormat(legends, allGroups, side)
								: deckToJson(name, legends, allGroups, side)}
				/>
				<DeckImageDialog
					deckName={name}
					ownerName={deck.player}
					legends={legends.map((card) => ({ card }))}
					mainGroups={allGroups}
					sideboard={side}
					shareUrl={`${page.url.origin}/tournaments/decks/${deck.guid}`}
				/>
				<button
					type="button"
					onclick={openAsNewDeck}
					class="rounded-md border border-edge px-3 py-1.5 text-sm text-body hover:border-neon hover:text-neon"
					title="Start a deck of your own from this list"
				>
					Open as a new deck
				</button>
				<ViewToggle
					value={choice.value}
					options={DECK_VIEWS}
					onchange={(next) => (choice.value = next)}
				/>
			</div>
		</div>

		<DeckCardList
			{groups}
			view={choice.value}
			onfocus={(card) => (focused = card)}
			galleryColumns={layout === 'pane' ? 'grid-cols-4 2xl:grid-cols-5' : 'grid-cols-5'}
		/>
		{#if side.length > 0}
			<DeckSideboard
				entries={side}
				view={choice.value}
				onfocus={(card) => (focused = card)}
				cards={sideCards}
				legal={sideCards === SIDEBOARD_SIZE}
			/>
		{/if}
		{#if deck.unresolved > 0}
			<p class="mt-3 text-[11px] text-muted">
				{deck.unresolved} line{deck.unresolved === 1 ? '' : 's'} of this list didn't match a known card.
			</p>
		{/if}
	</div>

	<div
		bind:this={railColumn}
		class="flex flex-col gap-4 {layout === 'pane'
			? '2xl:min-h-0 2xl:overflow-y-auto 2xl:pr-1'
			: ''}"
	>
		{#if layout === 'pane'}
			<div class="hidden lg:block"><DeckPreview card={shown} sizes="256px" /></div>
		{/if}
		{@render rail?.()}
		<DeckPrice entries={priced} ownerCanChoosePrinting={false} />
		<DeckStats entries={main} total={mainCards} {pick} onpick={(next) => (pick = next)} />
	</div>
</div>
