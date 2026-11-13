<script lang="ts">
	/**
	 * `/decks/[id]/edit` — the deckbuilder on an account-backed deck, owner-only. The screen itself is
	 * `DeckEditor` (`docs/spec/deckbuilder.md` §5), shared with `/decks/new`'s local draft; this is
	 * only the host that loads a saved deck into it. Its read-only counterpart is `/d/[code]`.
	 */
	import DeckEditor from '#lib/components/DeckEditor.svelte';

	let { data, form } = $props();
</script>

<DeckEditor {data} {form} />
