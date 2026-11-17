<script lang="ts">
	// One Tournament Deck on a page of its own: what a link to a deck, or a narrow screen, lands on.
	// On a wide screen the deck list shows the same thing in a pane beside it.
	import DeckDetail from '#lib/components/tournaments/DeckDetail.svelte';
	import { periodParams } from '#lib/tournaments/period.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();
</script>

<a
	href={href('/tournaments/decks', periodParams(data.period))}
	class="font-mono text-xs text-muted hover:text-body"
>
	← All decks
</a>

<div class="mt-3">
	<DeckDetail
		deck={data.deck}
		view={data.deckView}
		hrefFor={(guid) => href(`/tournaments/decks/${guid}`, periodParams(data.period))}
	/>
</div>
