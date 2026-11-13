<script lang="ts">
	/**
	 * `/decks/new` — the builder on a **local draft** (`docs/spec/deckbuilder.md` §10.5): a deck that
	 * lives in this browser until Save, so a visitor can build before deciding to make an account.
	 *
	 * This page only supplies what an account-backed deck would get from the server — the draft out
	 * of `localStorage` — and the four things a draft does differently (`DraftControls`). The screen
	 * is `DeckEditor`.
	 */
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import DeckEditor, {
		type DraftControls,
		type EditorData
	} from '#lib/components/DeckEditor.svelte';
	import {
		DEFAULT_DECK_NAME,
		EMPTY_PAYLOAD,
		RESUME_COOKIE,
		clearDraft,
		loadDraft,
		storeDraft
	} from '#lib/decks/draft.js';

	let { data } = $props();

	// Read once, deliberately: a draft is seeded from the page's first load and never re-seeded.
	const { canChoosePrinting, deckView, user } = untrack(() => data);

	// Read once, here, before the editor seeds its state from it. Browser only, which is all this
	// page ever is (`+page.ts`).
	const stored = loadDraft();

	const editorData: EditorData = {
		deckId: null,
		shareCode: null,
		deckName: stored?.name ?? DEFAULT_DECK_NAME,
		payload: stored?.payload ?? EMPTY_PAYLOAD,
		bookmarks: stored?.bookmarks ?? [],
		guide: stored?.guide ?? '',
		canChoosePrinting,
		deckView
	};

	const draft: DraftControls = {
		signedIn: user !== undefined && user !== null,
		persist: storeDraft,
		discard() {
			clearDraft();
			// A reload is the honest reset: the editor seeded its state once from what was stored.
			location.reload();
		},
		async signIn() {
			// `/decks` is where every way of signing in ends up, and is what reads this.
			document.cookie = `${RESUME_COOKIE}=1; path=/; max-age=3600; samesite=lax`;
			await goto('/auth/login');
		},
		created: clearDraft,
		// Arrived from sign-in with something to save. Never on an empty draft: nothing to create.
		finish: page.url.searchParams.has('finish') && stored !== null
	};
</script>

<DeckEditor data={editorData} {draft} />
