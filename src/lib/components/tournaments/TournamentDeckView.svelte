<script lang="ts">
	// A Tournament Deck's cards, drawn the way a saved deck's are (`/d/[code]`): the card being pointed at
	// large beside the list, the cards by type as a table or as art, the sideboard framed apart, and the
	// deck's curve, colours and rarities. The same components, so the two views of a deck cannot drift.
	// A tournament deck is a list of card slugs and counts, resolved here through the card dataset; a line
	// the dataset does not know is left out (and `unresolved` already says so).
	import { dataset } from '#lib/cards/index.js';
	import type { Card } from '#lib/cards/schema.js';
	import DeckCardList from '#lib/components/deck/DeckCardList.svelte';
	import DeckPreview from '#lib/components/deck/DeckPreview.svelte';
	import DeckSideboard from '#lib/components/deck/DeckSideboard.svelte';
	import DeckStats from '#lib/components/deck/DeckStats.svelte';
	import ViewToggle from '#lib/components/deck/ViewToggle.svelte';
	import { cookieState } from '#lib/cookie-state.svelte.js';
	import { groupDeckEntries } from '#lib/decks/grouping.js';
	import { SIDEBOARD_SIZE, type DeckEntry } from '#lib/decks/legality.js';
	import type { DeckDetail } from '#lib/tournaments/deck-views.js';
	import { cardOf } from '#lib/tournaments/present.js';

	let {
		deck,
		view,
		layout = 'page'
	}: {
		deck: DeckDetail;
		/** The visitor's List / Gallery choice, read from its cookie on the server. */
		view: 'list' | 'gallery';
		/** `page` sets the preview, list and stats side by side; `pane` fits half a screen. */
		layout?: 'page' | 'pane';
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
	const groups = $derived(groupDeckEntries(dataset, main));
	const mainCards = $derived(sum(main));
	const sideCards = $derived(sum(side));

	let focused = $state<Card | null>(null);
	// A different deck starts from its own first card, not the last one pointed at.
	$effect(() => {
		void deck.guid;
		focused = null;
	});
	const shown = $derived(focused ?? legends[0] ?? main[0]?.card ?? null);
</script>

<div
	class="grid gap-6 {layout === 'page'
		? 'lg:grid-cols-[240px_1fr_280px]'
		: 'lg:grid-cols-[minmax(0,1fr)_14rem]'}"
>
	{#if layout === 'page'}
		<div class="hidden lg:sticky lg:top-6 lg:block lg:self-start">
			<DeckPreview card={shown} />
		</div>
	{/if}

	<div class="min-w-0">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<p class="text-sm text-muted tabular-nums">
				<span class="font-medium text-bright">{mainCards}</span> cards
				{#if sideCards > 0}
					· <span class="font-medium text-bright">{sideCards}/{SIDEBOARD_SIZE}</span> sideboard
				{/if}
			</p>
			<ViewToggle value={choice.value} onchange={(next) => (choice.value = next)} first="gallery" />
		</div>

		<DeckCardList
			{groups}
			view={choice.value}
			onfocus={(card) => (focused = card)}
			galleryColumns={layout === 'pane' ? 'grid-cols-4' : 'grid-cols-5'}
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

	<div class="flex flex-col gap-4">
		{#if layout === 'pane'}
			<div class="hidden lg:block"><DeckPreview card={shown} sizes="224px" /></div>
		{/if}
		<DeckStats entries={main} total={mainCards} />
	</div>
</div>
