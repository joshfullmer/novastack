<script lang="ts" module>
	import type { DeckVersionPayload } from '#lib/decks/schema.js';
	import type { DraftState } from '#lib/decks/draft.js';

	/** What the editor needs to know about the deck it opens. A saved deck's comes from the server;
	 * a local draft's from `localStorage`, with no id or share code because none exists yet. */
	export type EditorData = {
		deckId: string | null;
		shareCode: string | null;
		deckName: string;
		payload: DeckVersionPayload;
		bookmarks: string[];
		guide: string;
		canChoosePrinting: boolean;
		deckView: 'list' | 'gallery';
	};

	/**
	 * Present exactly when the editor is on a **local draft** (`docs/spec/deckbuilder.md` §10.5) —
	 * its presence *is* the mode. Everything account-backed is routed through here instead: the
	 * draft persists to `localStorage`, Bookmarks and the name stay local, and Save creates the deck.
	 */
	export type DraftControls = {
		signedIn: boolean;
		/** Called whenever anything in the draft changes. */
		persist: (state: DraftState) => void;
		/** Throw the draft away and start over. */
		discard: () => void;
		/** Signed out: remember to come back, and go sign in. */
		signIn: () => Promise<void>;
		/** The deck now exists on the server; forget the local copy. */
		created: () => void;
		/** Arrived from sign-in with a draft waiting: save it without another click. */
		finish: boolean;
	};
</script>

<script lang="ts">
	/**
	 * The deckbuilder screen — `docs/spec/deckbuilder.md` §5. State is seeded from the loaded deck,
	 * mutated locally via `#lib/decks/deck-state.svelte.js`, and saved through the `save` action as
	 * one new `deck_versions` row.
	 *
	 * Two hosts: `/decks/[id]/edit` (an account-backed deck, owner-only — the read-only counterpart
	 * others see is `/d/[code]`) and `/decks/new` (a local draft, see `DraftControls`).
	 *
	 * **Per-entry editing happens in `DeckEntryManager`**, opened by clicking an entry. That came
	 * out of two variant rounds (`.scratch/` has the notes): controls small enough to sit beside a
	 * row in a 360px rail were never comfortable to hit, so the rail widened to 480px, the Gallery
	 * went 3-up, and the row became a target rather than a host for controls. Copies are still
	 * one click away, via the steppers overlaid on each tile.
	 *
	 * Export (§6) is deliberately absent — sharing/export is Phase 2, not built yet.
	 */
	import { enhance } from '$app/forms';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import CardHoverPreview from '#lib/components/CardHoverPreview.svelte';
	import CardImage from '#lib/components/CardImage.svelte';
	import { COLOR_TEXT } from '#lib/components/color.js';
	import { dataset } from '#lib/cards/index.js';
	import type { Card } from '#lib/cards/schema.js';
	import { admits } from '#lib/filters/budget.js';
	import { evaluate, type Match, type Predicate } from '#lib/filters/predicate.js';
	import { withFacetEdit } from '#lib/filters/query-edit.js';
	import { parseQuery, type ParseOptions } from '#lib/query/index.js';
	import { SvelteSet } from 'svelte/reactivity';
	import * as v from 'valibot';
	import { DEFAULT_SORT, sortMatches } from '#lib/filters/sort.js';
	import {
		LEGEND_SLOTS,
		MAX_COPIES,
		MAX_DECK_SIZE,
		MIN_DECK_SIZE,
		SIDEBOARD_SIZE,
		canCompleteWithLegend,
		combinedEntries
	} from '#lib/decks/legality.js';
	import DeckEntryManager from '#lib/components/DeckEntryManager.svelte';
	import DeckGuideDialog from '#lib/components/DeckGuideDialog.svelte';
	import DeckImportDialog from '#lib/components/DeckImportDialog.svelte';
	import ImportIcon from '#lib/components/ImportIcon.svelte';
	import { collection } from '#lib/collection/state.svelte.js';
	import { missingForDeck, ownedOfCard } from '#lib/collection/missing.js';
	import { createDeckState } from '#lib/decks/deck-state.svelte.js';
	import { deckPath } from '#lib/decks/links.js';
	import { deckPrinting } from '#lib/decks/printing.js';
	import { groupDeckEntries, groupMatchesByType } from '#lib/decks/grouping.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';
	import { cookieState } from '#lib/cookie-state.svelte.js';
	import { persistedIntState } from '#lib/persisted-state.svelte.js';

	/**
	 * Which entry the manager (`DeckEntryManager`) is open on, by card slug — `null` when closed.
	 *
	 * Clicking an entry opens it rather than removing a copy. That gesture change came out of a
	 * variant round: a per-entry control small enough to fit beside a row was never comfortable to
	 * hit, and a single click that silently destroys a copy was a destructive default nobody asked
	 * for. The rail is 480px and the Gallery is 3-up for the same reason — at 4-up in 360px the
	 * tiles were too small to read the art anybody came here to choose.
	 */
	let managing = $state<string | null>(null);

	/** The printing a tile draws — the deck's own choice, else the Card's Default Printing. */
	const entryPrinting = (card: Card) => deckPrinting(card, deck.printingIdOf(card));

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

	let {
		data,
		form = null,
		draft = undefined
	}: {
		data: EditorData;
		form?: { message?: string } | null;
		draft?: DraftControls;
	} = $props();

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
	// A saved deck's name comes from the server (its own `?/rename` action); a draft's is local state.
	// svelte-ignore state_referenced_locally
	let draftName = $state(data.deckName);
	const deckName = $derived(draft ? draftName : data.deckName);
	// svelte-ignore state_referenced_locally
	let renameValue = $state(data.deckName);
	function startRename() {
		renameValue = deckName;
		renaming = true;
	}

	const ALL: Predicate = { kind: 'all' };

	// A deck that already has its 3 Legends opens straight on the Main Deck tab — see
	// `toggleLegend` below for the same rule applied live as Legends are picked/removed.
	let tab = $state<'legends' | 'main'>(deck.legends.length === LEGEND_SLOTS ? 'main' : 'legends');
	// Mounted once at the bottom, opened from the browse panel's import button — which renders in
	// both layouts, so a per-panel dialog would have meant two of them. `/decks`'s import button
	// arrives here with `?import`, which opens it straight away (see `afterNavigate` below).
	let importDialog: DeckImportDialog;
	// The Guide (`CONTEXT.md`) is local draft state here, like the cards: it persists with Save (a
	// hidden field beside the payload, since it isn't part of the versioned deck) and "Discard
	// changes" undoes it. Seeded once, for the same reason `deck` is.
	// svelte-ignore state_referenced_locally
	let guide = $state(data.guide);
	let guideDialog: DeckGuideDialog;
	// `afterNavigate` rather than `onMount`: it also runs on the initial hydration, and by then the
	// router is ready, which `goto` needs. The param is dropped so a reload doesn't reopen it.
	// One-shot, because a shallow `goto` leaves `page.url` as it was: without the flag the dropped
	// param would still be there to read, and this would reopen the dialog and `goto` forever.
	let openedFromImportParam = false;
	afterNavigate(() => {
		if (openedFromImportParam || !page.url.searchParams.has('import')) return;
		openedFromImportParam = true;
		importDialog.show();
		const url = new URL(page.url.href);
		url.searchParams.delete('import');
		goto(url, { state: page.state, shallow: true, replace: true });
	});
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
	// View state, like `addTarget`. Collapsing hides the sideboard's cards, not its `n/7` count —
	// on a phone the bottom sheet is short, and a gallery of 7 tiles can push the main deck off it.
	let sideboardOpen = $state(true);
	// Shared with the read-only view (`/decks/[id]`) — "how I like browsing a deck's cards" is
	// one preference, not two. Server-rendered from a cookie (`data.deckView`, read in
	// `+page.server.ts`) rather than `localStorage`: this page isn't prerendered, so the server
	// can pick the right branch on the very first render — no flash, and no need to render the
	// other one just in case.
	// svelte-ignore state_referenced_locally
	const deckView = cookieState('deck-cards-view', data.deckView);
	let hovered = $state<{ card: Card; printingId?: string; left: number; top: number } | null>(null);

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

	// Ownership is information here, never a gate (`docs/spec/deckbuilder.md` §10.1): it feeds
	// `owned:` in the search boxes, the tiles' owned badge and the Missing total — and nothing is
	// ever hidden or disabled for want of a copy. The Collection is a client-side singleton
	// (`#lib/collection/state.svelte.ts`); signed out, it settles on `signed-out` and all of this
	// simply doesn't render.
	$effect(() => {
		// A visitor with no account has no Collection; asking would only log a 401.
		if (draft && !draft.signedIn) return;
		void collection.load();
	});
	const ownedOf = (printingId: string) => collection.quantityOf(printingId);
	const collectionReady = $derived(collection.status === 'ready');

	/**
	 * This deck's Bookmarks (`CONTEXT.md`) — the author's "maybe" flags, by Card slug. Not part of
	 * the deck, so not in `createDeckState` and not in Save: they persist the moment they change,
	 * through their own endpoint (`./bookmark/+server.ts`), and "Discard changes" leaves them alone.
	 */
	// svelte-ignore state_referenced_locally
	const bookmarks = new SvelteSet<string>(data.bookmarks);
	const bookmarkedOf = (slug: string) => bookmarks.has(slug);
	let bookmarkError = $state<string | null>(null);

	/** Optimistic, absolute, rolled back on failure — the Collection's own write discipline. */
	async function toggleBookmark(card: Card) {
		const bookmarked = !bookmarks.has(card.slug);
		if (bookmarked) bookmarks.add(card.slug);
		else bookmarks.delete(card.slug);
		bookmarkError = null;
		// A draft has no deck row to write to yet; its Bookmarks persist with the rest of it.
		if (draft) return;
		try {
			const response = await fetch(`/decks/${data.deckId}/edit/bookmark`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ cardSlug: card.slug, bookmarked })
			});
			if (!response.ok) throw new Error(String(response.status));
		} catch {
			if (bookmarked) bookmarks.delete(card.slug);
			else bookmarks.add(card.slug);
			bookmarkError = `Couldn't ${bookmarked ? 'bookmark' : 'unbookmark'} ${card.name}.`;
		}
	}

	// --- Local draft (`docs/spec/deckbuilder.md` §10.5) ----------------------------------------------
	// Every change to a draft is written straight through; the host decides where (`localStorage`).
	$effect(() => {
		if (!draft) return;
		draft.persist({
			name: draftName,
			payload: deck.toPayload(),
			bookmarks: [...bookmarks],
			guide
		});
	});

	let saving = $state(false);
	let saveError = $state<string | null>(null);

	/** Creates the deck on the server from the draft. Signed out, that means signing in first — the
	 * draft is already safe in storage, so the trip costs nothing. */
	async function saveDraft() {
		if (!draft || saving) return;
		saveError = null;
		if (!draft.signedIn) {
			await draft.signIn();
			return;
		}
		saving = true;
		try {
			const response = await fetch('/decks/new/create', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: draftName,
					payload: deck.toPayload(),
					bookmarks: [...bookmarks],
					guide
				})
			});
			if (!response.ok) throw new Error(String(response.status));
			const { href } = v.parse(v.object({ href: v.string() }), await response.json());
			draft.created();
			await goto(href);
		} catch {
			saveError = "Couldn't save the deck. Your draft is still here.";
			saving = false;
		}
	}

	// Back from signing in with a draft waiting: finish what the visitor started, once.
	let finished = false;
	$effect(() => {
		if (!draft?.finish || !draft.signedIn || finished) return;
		finished = true;
		void saveDraft();
	});

	// `bookmarked:` only exists where a Deck does, so every parse in this editor opts in.
	const QUERY: ParseOptions = { deck: true };

	function matchesFor(source: string): Match[] {
		const trimmed = source.trim();
		const predicate = trimmed === '' ? ALL : parseQuery(trimmed, dataset, QUERY).predicate;
		return sortMatches(dataset, evaluate(dataset, predicate, ownedOf, bookmarkedOf), DEFAULT_SORT);
	}

	/** Is the bookmark chip on — a `bookmarked:yes` clause that is its own top-level term, which is
	 * the only shape the chip writes and so the only one it claims (spec §9). */
	function bookmarkFilterOn(source: string): boolean {
		const { predicate } = parseQuery(source, dataset, QUERY);
		const terms = predicate.kind === 'and' ? predicate.children : [predicate];
		return terms.some((term) => term.kind === 'bookmarked' && term.value);
	}

	function setSearch(value: string) {
		if (tab === 'legends') searchLegends = value;
		else searchMain = value;
	}

	/** The current tab's query text — the one search box shows and the bookmark chip edits. */
	const activeSearch = $derived(tab === 'legends' ? searchLegends : searchMain);
	const bookmarkOn = $derived(bookmarkFilterOn(activeSearch));

	/** Sideboard cards are bound by the same Legends' RAM as the main deck — see `combinedEntries`. */
	const combinedCards = $derived(combinedEntries(deck.entries, deck.sideboard));

	/** Each tab's search runs through the same query language and default sort as `/cards`,
	 * plus its own intrinsic filter. */
	const visibleMatches = $derived.by(() => {
		if (tab === 'legends') {
			return (
				matchesFor(searchLegends)
					.filter((match) => match.card.cardType === 'Legend')
					.filter((match) => isChosenLegend(match.card) || deck.legends.length < LEGEND_SLOTS)
					// Cards go in before Legends do, so rather than "affordable now" this keeps every
					// Legend that can still lead to a legal deck given what's already in it.
					.filter(
						(match) =>
							isChosenLegend(match.card) ||
							canCompleteWithLegend(deck.legends, match.card, combinedCards, dataset.ramPerLegend)
					)
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

	/**
	 * What the viewer is short of to build the deck as it stands in this draft — the same Card-level
	 * rule and the same list (Legends, Main Deck, Sideboard) as the Collection tab on `/d/[code]`,
	 * which is where "add to wantlist" lives.
	 */
	const missing = $derived(
		missingForDeck(
			[
				...deck.legends.map((legend) => ({ card: legend, quantity: 1 })),
				...deck.entries,
				...deck.sideboard
			],
			ownedOf
		)
	);
	/** Only a saved deck has a page to open; a draft's Missing is just the number. */
	const collectionHref = $derived(
		data.deckId === null
			? null
			: `${deckPath({ id: data.deckId, shareCode: data.shareCode })}?tab=collection`
	);

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
		// The deck's own art for it, if it chose any — `undefined` for a card not (yet) in the deck.
		hovered = { card, printingId: deck.printingIdOf(card), left: rect.left, top: rect.top };
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

	// --- Drag to add (`docs/spec/deckbuilder.md` §10.3) ------------------------------------------
	// Native HTML5 drag, on purpose: the drop targets are whole sections, not precise slots, so the
	// Binder's hand-rolled pointer drag (`#lib/collection/pocket-drag.svelte.ts`) would be machinery
	// spent on a gesture that needs none of it. It is desktop-only; click stays the primary path
	// and the only one on touch. The payload lives in component state, not the `DataTransfer` —
	// `dragover` can't read a drag's data, only its types, and the drop rules need the card.

	/** Where a dragged card came from. */
	type DragFrom = 'catalog' | 'deck' | 'sideboard';
	type DropZone = 'legends' | 'deck' | 'sideboard' | 'browse';

	let drag = $state<{ card: Card; from: DragFrom } | null>(null);
	let overZone = $state<DropZone | null>(null);

	/**
	 * Whether a drop is allowed — the same rules as the clicks it stands in for, so the two can't
	 * disagree. Moving a row between piles keeps its copy count, so it skips the copy limit that
	 * adding from the catalog is bound by, but still honours a full sideboard.
	 */
	function canDropOn(zone: DropZone, { card, from }: { card: Card; from: DragFrom }): boolean {
		switch (zone) {
			case 'legends':
				return (
					from === 'catalog' &&
					card.cardType === 'Legend' &&
					!isChosenLegend(card) &&
					deck.legends.length < LEGEND_SLOTS
				);
			case 'deck':
				if (card.cardType === 'Legend') return false;
				return from === 'catalog' ? deck.canAddCopy(card) : from === 'sideboard';
			case 'sideboard':
				if (card.cardType === 'Legend') return false;
				return from === 'catalog'
					? deck.canAddToSideboard(card)
					: from === 'deck' && deck.sideboardCards < SIDEBOARD_SIZE;
			case 'browse':
				// Dragging a row back to where cards come from takes one copy out, like its `−`.
				return from !== 'catalog';
		}
	}

	function dropOn(zone: DropZone) {
		const source = drag;
		endDrag();
		if (!source || !canDropOn(zone, source)) return;
		const { card, from } = source;
		hovered = null;

		if (zone === 'legends') return toggleLegend(card);
		if (zone === 'browse') {
			return from === 'deck' ? deck.removeCard(card) : deck.removeFromSideboard(card);
		}
		if (from === 'deck') deck.removeCard(card);
		else if (from === 'sideboard') deck.removeFromSideboard(card);
		if (zone === 'deck') deck.addCard(card);
		else {
			deck.addToSideboard(card);
			sideboardOpen = true;
		}
	}

	function endDrag() {
		drag = null;
		overZone = null;
	}

	/** Spread onto whatever can be picked up. `enabled: false` leaves it an ordinary element. */
	function dragSource(card: Card, from: DragFrom, enabled = true) {
		return {
			draggable: enabled,
			ondragstart(event: DragEvent) {
				if (!enabled) return;
				drag = { card, from };
				hovered = null;
				if (event.dataTransfer) {
					// Firefox won't start a drag without data; the real payload is `drag` above.
					event.dataTransfer.setData('text/plain', card.slug);
					event.dataTransfer.effectAllowed = from === 'catalog' ? 'copy' : 'move';
				}
			},
			ondragend: endDrag
		};
	}

	/** Spread onto a section that accepts drops. Only claims a drag it would actually take, so the
	 * browser shows the "no drop" cursor everywhere else. */
	function dropZone(zone: DropZone) {
		return {
			ondragover(event: DragEvent) {
				if (!drag || !canDropOn(zone, drag)) return;
				event.preventDefault();
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = drag.from === 'catalog' ? 'copy' : 'move';
				}
				overZone = zone;
			},
			ondragleave(event: DragEvent) {
				// Crossing into a child fires `dragleave` on the parent; only leaving the section counts.
				const { currentTarget, relatedTarget } = event;
				if (currentTarget instanceof Node && relatedTarget instanceof Node) {
					if (currentTarget.contains(relatedTarget)) return;
				}
				if (overZone === zone) overZone = null;
			},
			ondrop(event: DragEvent) {
				event.preventDefault();
				dropOn(zone);
			}
		};
	}

	/** While dragging, every section that would take the card gets a dashed edge; the one under the
	 * pointer fills. Classes are whole literals so Tailwind sees them. */
	function zoneClass(zone: DropZone): string {
		if (overZone === zone) {
			return 'bg-neon/10 outline-2 -outline-offset-2 outline-dashed outline-neon';
		}
		if (drag && canDropOn(zone, drag)) {
			return 'outline-1 -outline-offset-2 outline-dashed outline-neon-dim';
		}
		return '';
	}
</script>

<svelte:head>
	<title>{deckName} — novastack</title>
</svelte:head>

<!-- One definition, used by both piles' List rows. -->
{#snippet manageButton(card: Card)}
	<button
		type="button"
		onclick={() => (managing = card.slug)}
		aria-label="Manage {card.name}"
		class="shrink-0 rounded-md border border-edge px-1.5 text-muted transition-colors
			hover:border-neon-dim hover:text-neon">⋯</button
	>
{/snippet}

<!--
	The overlaid copy controls, in a Gallery tile's bottom corners.
	`−` left, `+` right: mirrored so neither sits under the cursor after the other, leaving the
	quantity badge the centre. Only viable at this tile size — at the old 80px they'd have covered
	the art they exist to leave visible.
-->
{#snippet tileSteppers(card: Card, pile: 'deck' | 'sideboard')}
	{@const canAdd = pile === 'deck' ? deck.canAddCopy(card) : deck.canAddToSideboard(card)}
	<span class="pointer-events-none absolute inset-x-1 bottom-1 flex items-end justify-between">
		<button
			type="button"
			onclick={(event) => {
				// The tile underneath opens the manager; a stepper click must not also do that.
				event.stopPropagation();
				if (pile === 'deck') removeCard(card);
				else removeFromSideboard(card);
			}}
			aria-label="One fewer {card.name}"
			class="pointer-events-auto grid size-6 place-items-center rounded-md border border-edge
				bg-void/90 text-muted backdrop-blur-sm transition-colors hover:border-card-red
				hover:text-card-red"
		>
			<!-- A stroke, not a `−` glyph: `place-items-center` centres the *line box*, and `+`/`−`
			     sit on the baseline with descender space under them, so the ink reads low in a box
			     this small. A path centred in its own viewBox is centred by construction, in any
			     font. `QuantityStepper.svelte` documents the same finding. -->
			<svg viewBox="0 0 12 12" class="size-3" aria-hidden="true">
				<path d="M2.5 6h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>
		<button
			type="button"
			onclick={(event) => {
				event.stopPropagation();
				if (pile === 'deck') deck.addCard(card);
				else deck.addToSideboard(card);
			}}
			disabled={!canAdd}
			aria-label="One more {card.name}"
			class="pointer-events-auto grid size-6 place-items-center rounded-md border border-edge
				bg-void/90 text-muted backdrop-blur-sm transition-colors hover:border-neon-dim
				hover:text-neon disabled:opacity-30"
		>
			<svg viewBox="0 0 12 12" class="size-3" aria-hidden="true">
				<path
					d="M6 2.5v7M2.5 6h7"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</span>
{/snippet}

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
				onsubmit={(event) => {
					// A draft has no `?/rename` to post to; the name is just local state.
					if (!draft) return;
					event.preventDefault();
					draftName = renameValue.trim() === '' ? draftName : renameValue.trim();
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
				>{deckName}</button
			>
		{/if}
		{#if draft}
			<span
				class="mr-2 shrink-0 text-[10px] tracking-wide text-muted uppercase"
				title="Kept in this browser only. Save deck{draft.signedIn
					? ''
					: ' (you will sign in first)'} to keep it for good.">Local draft</span
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
		<!-- Rare, and mostly used once while a deck is being started, so it is a quiet text button
		     out of the way rather than a full-width one competing with Save in the deck panel. It
		     lives here because `browsePanel` renders in both the desktop and mobile layouts. The
		     `-mt-1.5` keeps its 32px from making the row taller than the tabs: they rest their
		     underline on the row's bottom border, which a taller row would leave floating. -->
		<!-- Beside Import for the same reason it is quiet: used once per deck, not while building. A dot
		     says there is one. `ml-auto` here, not on Import, so the pair sits at the right edge. -->
		<button
			type="button"
			onclick={() => guideDialog.show()}
			title="Write the deck's guide"
			class="relative -mt-1.5 ml-auto flex h-8 shrink-0 items-center gap-1.5 self-start rounded-md
				border border-edge px-2.5 text-xs text-muted transition-colors hover:border-neon
				hover:text-neon"
		>
			Guide
			{#if guide.trim() !== ''}
				<span class="size-1.5 rounded-full bg-neon" aria-label="Has a guide"></span>
			{/if}
		</button>
		<button
			type="button"
			onclick={() => importDialog.show()}
			aria-label="Import a decklist"
			title="Import a decklist"
			class="-mt-1.5 flex size-8 shrink-0 items-center justify-center self-start rounded-md
				border border-edge text-muted transition-colors hover:border-neon hover:text-neon"
		>
			<ImportIcon class="size-4" />
		</button>
	</div>

	<div class="flex items-center gap-2 p-4">
		<input
			type="search"
			value={tab === 'legends' ? searchLegends : searchMain}
			oninput={(event) => setSearch(event.currentTarget.value)}
			placeholder={tab === 'legends'
				? 'Search legends… (color:red type:legend …)'
				: 'Search cards… (cost<=3 tag:corpo …)'}
			class="min-w-0 flex-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
				placeholder:text-muted focus:border-neon focus:outline-none"
		/>
		<!-- The Bookmark filter as a chip: it writes `bookmarked:yes` into the query and takes it back
		     out, leaving everything else typed there alone (`withFacetEdit`), so it composes with
		     the rest of the language rather than being a second filter beside it. -->
		<button
			type="button"
			onclick={() =>
				setSearch(
					withFacetEdit(
						activeSearch,
						dataset,
						{ facet: 'bookmarked', value: bookmarkOn ? null : true },
						QUERY
					)
				)}
			aria-pressed={bookmarkOn}
			title={bookmarkOn ? 'Showing bookmarked cards only' : 'Show bookmarked cards only'}
			aria-label="Bookmarked cards only"
			class="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors
				hover:text-bright {bookmarkOn
				? 'border-neon bg-raised text-neon'
				: 'border-edge text-muted hover:border-neon-dim'}"
		>
			<svg
				viewBox="0 0 24 24"
				class="size-4"
				aria-hidden="true"
				fill={bookmarkOn ? 'currentColor' : 'none'}
				stroke="currentColor"
				stroke-width="2"
				stroke-linejoin="round"
				><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z" /></svg
			>
			<span class="tabular-nums">{bookmarks.size}</span>
		</button>
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

	<div
		class="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4 {zoneClass('browse')}"
		{...dropZone('browse')}
	>
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
			{#if bookmarkError}
				<p role="alert" class="min-w-0 truncate text-card-red">{bookmarkError}</p>
			{/if}
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
	{@const marked = bookmarks.has(match.card.slug)}
	{@const maxedOut =
		tab === 'main' &&
		!(targetingSideboard ? deck.canAddToSideboard(match.card) : deck.canAddCopy(match.card))}
	<li class="group/tile relative">
		<button
			type="button"
			disabled={maxedOut}
			{...dragSource(
				match.card,
				'catalog',
				tab === 'legends' ? !chosen && deck.legends.length < LEGEND_SLOTS : !maxedOut
			)}
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
			class="group relative block w-full overflow-hidden rounded-md transition-transform hover:-translate-y-0.5
				disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:-translate-y-0
				[&_img]:pointer-events-none"
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
			<!-- Card level, every Printing rolled up (`ownedOfCard`) — the same count `owned:` and Missing
			     use. Absent means none, so a tile for a card you lack is simply quiet. -->
			{#if collectionReady}
				{@const owned = ownedOfCard(match.card, ownedOf)}
				{#if owned > 0}
					<span
						class="pointer-events-none absolute top-1 right-1 rounded bg-void/80 px-1 text-[10px]
							font-bold text-neon tabular-nums"
						title="You own {owned}">own {owned}</span
					>
				{/if}
			{/if}
		</button>
		<!-- A ribbon hanging from the top edge, like a real bookmark, rather than an icon: it reads as a
		     physical mark on the card, and "marked" is simply "the ribbon is in". A sibling of the add
		     button, not inside it — one button can't hold another, and this click must never also add
		     the card. Unmarked, it is out of the way until the tile is hovered or focused (and on touch,
		     where there is no hover, it stays put, dimmed). Marked, it stays in the accent colour.
		     The tail lengthens on hover — `h-8` → `h-10`, 200ms ease-out. The swallowtail is a
		     `clip-path`, which would also clip a shadow on the same element, so the shadow sits on the
		     wrapper. -->
		<button
			type="button"
			onclick={() => toggleBookmark(match.card)}
			aria-pressed={marked}
			aria-label="{marked ? 'Remove bookmark from' : 'Bookmark'} {match.card.name}"
			title={marked ? 'Remove bookmark' : 'Bookmark — maybe for this deck'}
			class="group/bookmark absolute top-0 left-1/2 flex h-12 w-9 -translate-x-1/2 items-start
				justify-center transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100
				focus-visible:outline-none [@media(hover:none)]:opacity-100 {marked
				? 'opacity-100'
				: 'opacity-0 [@media(hover:none)]:opacity-60'}"
		>
			<span
				class="drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)] group-focus-visible/bookmark:drop-shadow-[0_0_3px_var(--color-neon)]"
			>
				<span
					class="block h-8 w-5 bg-gradient-to-b transition-[height,filter] duration-200 ease-out
						group-hover/bookmark:h-10 group-hover/bookmark:brightness-125 group-focus-visible/bookmark:h-10
						motion-reduce:transition-none {marked ? 'from-neon to-neon-dim' : 'from-muted to-edge'}"
					style="clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)"
				></span>
			</span>
		</button>
	</li>
{/snippet}

{#snippet deckPanel()}
	<div
		class="border-b border-edge p-4 {zoneClass('legends')}"
		role="group"
		onmouseleave={() => (hovered = null)}
		{...dropZone('legends')}
	>
		<p class="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
			Legends {deck.legends.length}/{LEGEND_SLOTS}
		</p>
		<div class="flex gap-2">
			{#each legendSlots as slot (slot)}
				{@const legend = deck.legends[slot]}
				<!-- A Legend click used to remove it outright — the same destructive default the Gallery
				     tiles had, on the three cards a deck is *built* around. It opens the manager now,
				     where removal is a labelled button. -->
				<button
					type="button"
					disabled={!legend}
					onclick={() => legend && (managing = legend.slug)}
					aria-label={legend ? `Manage ${legend.name}` : `Legend slot ${slot + 1}: empty`}
					class="flex size-20 items-center justify-center overflow-hidden rounded-md border
						border-edge disabled:cursor-default"
					class:hover:border-neon-dim={!!legend}
				>
					{#if legend}
						{@const legendPrinting = deckPrinting(legend, deck.printingIdOf(legend))}
						<CardImage
							printingId={legendPrinting.id}
							thumbhash={legendPrinting.thumbhash}
							color={legend.color}
							alt={legend.name}
							sizes="80px"
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
		<!-- Missing is information, not an issue: building a deck of cards you don't own yet is normal,
		     so it doesn't join the issues banner below. The link opens the *saved* deck's Collection
		     tab, where "add to wantlist" lives. -->
		{#if collectionReady && deck.totalCards + deck.legends.length > 0}
			<p class="mt-1 text-xs text-muted">
				{#if missing.complete}
					<span class="text-neon">You own every card in this deck.</span>
				{:else}
					<svelte:element
						this={collectionHref ? 'a' : 'span'}
						href={collectionHref ?? undefined}
						title={collectionHref
							? "Opens the saved deck's Collection tab — unsaved changes aren't reflected there."
							: undefined}
						class={collectionHref
							? 'underline decoration-dotted underline-offset-2 hover:text-bright'
							: undefined}
						>Missing {missing.cardCount}
						{missing.cardCount === 1 ? 'card' : 'cards'} · {missing.copyCount}
						{missing.copyCount === 1 ? 'copy' : 'copies'}</svelte:element
					>
				{/if}
			</p>
		{/if}
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

	<div
		class="flex items-center justify-between border-b border-edge px-4 py-3 {zoneClass('deck')}"
		{...dropZone('deck')}
	>
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
					onclick={() => (deckView.value = 'gallery')}
					class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
					class:bg-raised={deckView.value === 'gallery'}
					class:text-bright={deckView.value === 'gallery'}
					class:text-muted={deckView.value !== 'gallery'}>Gallery</button
				>
				<button
					type="button"
					onclick={() => (deckView.value = 'list')}
					class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
					class:bg-raised={deckView.value === 'list'}
					class:text-bright={deckView.value === 'list'}
					class:text-muted={deckView.value !== 'list'}>List</button
				>
			</div>
		</div>
	</div>

	{#if deckView.value === 'list'}
		<ul
			class="flex-1 overflow-y-auto {zoneClass('deck')}"
			role="list"
			onmouseleave={() => (hovered = null)}
			{...dropZone('deck')}
		>
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
						<!-- The whole name is the target: "click the entry to manage it" is the gesture, and
						     a 24px `⋯` beside it would be the thing round one proved doesn't work. -->
						<button
							type="button"
							onclick={() => (managing = entry.card.slug)}
							{...dragSource(entry.card, 'deck')}
							class="min-w-0 flex-1 truncate text-left text-sm hover:text-bright
								{COLOR_TEXT[entry.card.color]}"
						>
							<span class="mr-1.5 text-muted tabular-nums">{entry.quantity}×</span>{entry.card.name}
						</button>
						{@render manageButton(entry.card)}
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
		<div
			class="flex-1 overflow-y-auto p-3 {zoneClass('deck')}"
			onmouseleave={() => (hovered = null)}
			role="group"
			{...dropZone('deck')}
		>
			{#each mainGroups as group (group.cardType)}
				<p
					class="mt-3 mb-1.5 rounded-md bg-raised px-3 py-1.5 text-xs tracking-wide uppercase
						first:mt-0"
				>
					<span class="font-semibold text-bright">{group.label}</span>
					<span class="text-muted tabular-nums">{group.quantity}</span>
				</p>
				<!-- 3 across, not 4: at 4-up in this rail the tiles were ~80px, too small to read the
				     art. See the `managing` comment above. -->
				<ul class="grid grid-cols-3 gap-2">
					{#each group.entries as entry (entry.card.slug)}
						{@const printing = entryPrinting(entry.card)}
						<li class="relative">
							<!-- No hover preview here, unlike the List rows: at this size the tile *is* the
							     preview, and a second copy of the art floating beside it was just noise. -->
							<button
								type="button"
								onclick={() => (managing = entry.card.slug)}
								aria-label="Manage {entry.card.name}"
								{...dragSource(entry.card, 'deck')}
								class="block w-full overflow-hidden rounded-md [&_img]:pointer-events-none"
							>
								<CardImage
									printingId={printing.id}
									thumbhash={printing.thumbhash}
									color={entry.card.color}
									alt={entry.card.name}
									sizes="140px"
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
							<!-- Copies without opening anything, overlaid on the art. -->
							{@render tileSteppers(entry.card, 'deck')}
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
		class="shrink-0 border-t-2 border-edge bg-void/40 {zoneClass('sideboard')}"
		onmouseleave={() => (hovered = null)}
		role="group"
		{...dropZone('sideboard')}
	>
		<button
			type="button"
			onclick={() => (sideboardOpen = !sideboardOpen)}
			aria-expanded={sideboardOpen}
			class="flex w-full items-center justify-between px-4 py-2.5 text-left"
		>
			<span class="flex items-center gap-2 text-sm font-medium text-bright">
				<span class="text-xs text-muted" aria-hidden="true">{sideboardOpen ? '▼' : '▶'}</span>
				Sideboard
			</span>
			<span
				class="text-sm font-medium tabular-nums {deck.sideboardStatus === 'legal'
					? 'text-neon'
					: 'text-muted'}"
				title="A constructed sideboard is exactly {SIDEBOARD_SIZE} cards"
			>
				{deck.sideboardCards}/{SIDEBOARD_SIZE}
			</span>
		</button>
		{#if !sideboardOpen}
			<!-- Collapsed: header only. -->
		{:else if deck.sideboard.length === 0}
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
						<!-- The 7 get the same treatment as the main deck — one gesture per deck, not per
						     pile. -->
						<button
							type="button"
							onclick={() => (managing = entry.card.slug)}
							{...dragSource(entry.card, 'sideboard')}
							class="min-w-0 flex-1 truncate text-left text-sm hover:text-bright
								{COLOR_TEXT[entry.card.color]}"
						>
							<span class="mr-1.5 text-muted tabular-nums">{entry.quantity}×</span>{entry.card.name}
						</button>
						{@render manageButton(entry.card)}
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
			<ul class="grid grid-cols-3 gap-2 border-t border-edge/50 p-3" role="list">
				{#each deck.sideboard as entry (entry.card.slug)}
					{@const sidePrinting = entryPrinting(entry.card)}
					<li class="relative">
						<button
							type="button"
							onclick={() => (managing = entry.card.slug)}
							aria-label="Manage {entry.card.name}"
							{...dragSource(entry.card, 'sideboard')}
							class="block w-full overflow-hidden rounded-md [&_img]:pointer-events-none"
						>
							<CardImage
								printingId={sidePrinting.id}
								thumbhash={sidePrinting.thumbhash}
								color={entry.card.color}
								alt={entry.card.name}
								sizes="140px"
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
						{@render tileSteppers(entry.card, 'sideboard')}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="border-t border-edge p-3">
		{#if form?.message || saveError}
			<p class="mb-2 text-xs text-card-red">{form?.message ?? saveError}</p>
		{/if}
		<!-- `grid-cols-2`, not `flex` + `flex-1` on each child — a `<form>` as a direct
		     `flex-1` sibling doesn't split evenly with a flex-1 sibling (a reproducible
		     browser quirk, verified in isolation) even with identical
		     flex-grow/shrink/basis/min-width. Grid's `minmax(0, 1fr)` tracks size by the
		     container, not by each item's own content, so it isn't exposed to that at all. -->
		<div class="grid grid-cols-2 gap-2">
			{#if draft}
				<!-- A draft has no saved version to go back to, so "discard" means start over. -->
				<button
					type="button"
					onclick={draft.discard}
					class="rounded-md border border-edge px-3 py-1.5 text-center text-sm font-medium
						text-body hover:border-card-red hover:text-card-red"
				>
					Discard draft
				</button>
				<button
					type="button"
					onclick={saveDraft}
					disabled={saving}
					class="w-full rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void
						hover:bg-neon-dim disabled:opacity-60"
					>{saving ? 'Saving…' : draft.signedIn ? 'Save deck' : 'Sign in to save'}</button
				>
			{:else}
				<a
					href="/d/{data.shareCode}"
					class="rounded-md border border-edge px-3 py-1.5 text-center text-sm font-medium
						text-body hover:border-card-red hover:text-card-red"
				>
					Discard changes
				</a>
				<form method="POST" action="?/save" use:enhance>
					<input type="hidden" name="payload" value={deckPayload} />
					<input type="hidden" name="guide" value={guide} />
					<button
						type="submit"
						class="w-full rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void
							hover:bg-neon-dim">Save deck</button
					>
				</form>
			{/if}
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
	<!-- 480px, up from 360: the rail hosts real per-entry controls now, and 3-up tiles at a size
	     where the art is legible. The browse grid still holds 8 columns comfortably at 1800px. -->
	<aside class="flex w-[480px] shrink-0 flex-col border-x border-edge bg-shell">
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

<!-- Mounted once here, not per row. -->
<DeckEntryManager bind:slug={managing} {deck} canChoosePrinting={data.canChoosePrinting} />
<!-- A full set of Legends opens on the Main Deck tab, as it does on load. -->
<DeckGuideDialog bind:this={guideDialog} bind:guide />
<DeckImportDialog
	bind:this={importDialog}
	{deck}
	onapply={() => (tab = deck.legends.length === LEGEND_SLOTS ? 'main' : tab)}
/>
