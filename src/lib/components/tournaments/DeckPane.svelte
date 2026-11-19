<script lang="ts">
	// The pane beside a list of decks: the open deck on a wide screen. Narrower, a deck chosen from a shared
	// link shows above the list, and with none chosen there is nothing to show. The decks list and an
	// event's standings both use it, so a deck reads the same wherever it opens.
	import DeckDetail from '#lib/components/tournaments/DeckDetail.svelte';
	import type { DeckView } from '#lib/decks/view.js';
	import type { DeckDetail as Deck } from '#lib/tournaments/deck-views.js';

	let {
		deck,
		view,
		ownPage,
		close,
		hrefFor,
		onopen
	}: {
		deck: Deck | null;
		view: DeckView;
		/** The deck's page of its own. */
		ownPage: string;
		/** The list's address without this deck. */
		close: string;
		/** Where an opponent's deck is. */
		hrefFor: (guid: string) => string;
		onopen: (event: MouseEvent, guid: string) => void;
	} = $props();
</script>

<aside
	aria-label="Deck"
	class="min-w-0 2xl:flex 2xl:min-h-0 2xl:flex-col 2xl:border-l 2xl:border-edge 2xl:pl-6 {deck
		? 'max-2xl:order-first'
		: 'max-2xl:hidden'}"
>
	{#if deck}
		<div class="mb-3 flex shrink-0 items-center justify-between font-mono text-xs">
			<a href={ownPage} class="text-muted hover:text-body">Open on its own page ↗</a>
			<a href={close} class="text-muted hover:text-body">Close ✕</a>
		</div>
		<DeckDetail {deck} {view} layout="pane" {hrefFor} {onopen} />
	{:else}
		<p class="py-24 text-center text-sm text-muted">Choose a deck to read it here.</p>
	{/if}
</aside>
