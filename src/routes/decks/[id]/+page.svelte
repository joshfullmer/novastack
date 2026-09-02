<script lang="ts">
	/**
	 * The read-only deck view — `docs/spec/deckbuilder.md` §7. What a non-owner sees for a
	 * public/unlisted deck, and what an owner sees before dropping into the editor
	 * (`/decks/[id]/edit`). Shares `#lib/decks/deck-state.svelte.js` with the editor purely for its
	 * derived getters (budget, size, RAM violations) — nothing here mutates it.
	 *
	 * Layout is "art-first, split focus" — chosen after a full research pass and 3 competing
	 * prototype variants, reviewed live (`.scratch/decks-view-layout/`, issues 01–04). Its
	 * distinguishing idea: a persistent, always-populated art-preview panel replaces the floating
	 * hover popup the two other variants kept — real layout width, not an overlay, and it never
	 * sits empty (falls back to the first Legend, or the first Main Deck entry, before anything's
	 * been hovered).
	 */
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { menuPosition } from '#lib/menu-position.js';
	import { SvelteSet } from 'svelte/reactivity';
	import CardImage from '#lib/components/CardImage.svelte';
	import CardMetaBadges from '#lib/components/CardMetaBadges.svelte';
	import CardStats from '#lib/components/CardStats.svelte';
	import { COLOR_BADGE_IMAGE, COLOR_DOT, COLOR_TEXT, COLOR_TINT } from '#lib/components/color.js';
	import { dataset } from '#lib/cards/index.js';
	import { splitCardName } from '#lib/cards/derive.js';
	import Meta from '#lib/components/Meta.svelte';
	import type { Card } from '#lib/cards/schema.js';
	import { COLORS } from '#lib/cards/vocabulary.js';
	import { LEGEND_SLOTS, MAX_DECK_SIZE, MIN_DECK_SIZE } from '#lib/decks/legality.js';
	import { createDeckState } from '#lib/decks/deck-state.svelte.js';
	import { composeDeckImage } from '#lib/decks/deck-image.js';
	import { deckToJson, deckToSimFormat } from '#lib/decks/export.js';
	import { groupDeckEntries } from '#lib/decks/grouping.js';
	import { rarityTint } from '#lib/decks/rarity-tone.js';
	import {
		colorComposition,
		costCurve,
		eddiableStat,
		rarityComposition
	} from '#lib/decks/stats.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';
	import { cookieState } from '#lib/cookie-state.svelte.js';

	const legendSlots = Array.from({ length: LEGEND_SLOTS }, (_, index) => index);

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const deck = createDeckState(data.payload);

	// Shared with the editor (`/decks/[id]/edit`) — "how I like browsing a deck's cards" is one
	// preference, not two. Server-rendered from a cookie (`data.deckView`, read in
	// `+page.server.ts`) rather than `localStorage`: this page isn't prerendered, so the server
	// can pick the right branch on the very first render — no flash, and no need to render the
	// other one just in case.
	// svelte-ignore state_referenced_locally
	const deckView = cookieState('deck-cards-view', data.deckView);

	// Main Deck / History — a tab, not a stacked section, so Change History (below) never
	// competes with the deck's own card list for vertical space.
	let mainTab = $state<'deck' | 'history'>('deck');

	function cardLabel(slug: string) {
		return dataset.bySlug.get(slug)?.name ?? slug;
	}
	function formatSavedAt(iso: string) {
		return new Date(iso).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	function cardPrinting(slug: string) {
		return dataset.bySlug.get(slug)?.printings[0];
	}
	function versionHasChanges(version: (typeof data.history)[number]) {
		return (
			version.diff.entries.length > 0 ||
			version.diff.legendsAdded.length > 0 ||
			version.diff.legendsRemoved.length > 0
		);
	}
	// Newest first; the deck-creation version (index 0) and any no-op save are noise, not history
	// worth showing.
	const visibleHistory = $derived(
		data.history.filter((version, index) => index > 0 && versionHasChanges(version)).reverse()
	);

	// The newest visible entry starts open — most users land here wanting to see the latest
	// change, not to go hunting for it. `svelte-ignore`: read once for the initial value only,
	// same pattern as `deck` above.
	// svelte-ignore state_referenced_locally
	const expandedVersions = new SvelteSet<string>(
		visibleHistory.length > 0 ? [visibleHistory[0].savedAt] : []
	);
	function toggleExpanded(savedAt: string) {
		if (expandedVersions.has(savedAt)) expandedVersions.delete(savedAt);
		else expandedVersions.add(savedAt);
	}

	type DiffCell = { slug: string; quantity: number };
	type EntryDiffColumns = {
		changed: { left: DiffCell; right: DiffCell }[];
		removed: DiffCell[];
		added: DiffCell[];
	};
	/**
	 * Left/right are packed independently, not zipped into shared grid rows — an unrelated removed
	 * card and an unrelated added card have no meaningful correspondence, so pairing them by row
	 * (e.g. by alphabetical position) left visible gaps wherever the two sides' counts diverged.
	 * Only `changed` (the same card, before/after) has a real pairing worth aligning.
	 */
	function entryDiffColumns(
		entries: import('#lib/decks/version-diff.js').EntryDiff[]
	): EntryDiffColumns {
		const byName = (a: { slug: string }, b: { slug: string }) =>
			cardLabel(a.slug).localeCompare(cardLabel(b.slug));
		const changed = entries
			.filter((e) => e.kind === 'changed')
			.map((e) => ({
				left: { slug: e.cardSlug, quantity: e.from },
				right: { slug: e.cardSlug, quantity: e.to }
			}))
			.sort((a, b) => byName(a.left, b.left));
		const removed = entries
			.filter((e) => e.kind === 'removed')
			.map((e) => ({ slug: e.cardSlug, quantity: e.quantity }))
			.sort(byName);
		const added = entries
			.filter((e) => e.kind === 'added')
			.map((e) => ({ slug: e.cardSlug, quantity: e.quantity }))
			.sort(byName);
		return { changed, removed, added };
	}
	/** Legends have no "changed" case (a slug either is or isn't a Legend) — just two short,
	 * usually equal-length lists, so a naive zip doesn't produce the same gaps `entryDiffColumns`
	 * had to avoid. */
	function legendDiffRows(removed: string[], added: string[]) {
		const rows: { left: string | null; right: string | null }[] = [];
		const max = Math.max(removed.length, added.length);
		for (let i = 0; i < max; i++) rows.push({ left: removed[i] ?? null, right: added[i] ?? null });
		return rows;
	}

	// The preview panel always shows *something* — defaults to the first Legend, or the first
	// Main Deck entry if there's no Legend yet, rather than sitting empty until a hover happens.
	const fallback = $derived(deck.legends[0] ?? deck.entries[0]?.card ?? null);
	let focused = $state<Card | null>(null);
	const shown = $derived(focused ?? fallback);

	const shownNameParts = $derived(shown === null ? null : splitCardName(shown));

	const mainGroups = $derived(groupDeckEntries(dataset, deck.entries));
	const sizeTone = $derived(SIZE_STATUS_TONE[deck.sizeStatus]);

	const curve = $derived(costCurve(deck.entries));
	const curveMax = $derived(Math.max(1, ...curve.map((bucket) => bucket.quantity)));
	const composition = $derived(
		colorComposition(deck.entries).filter((slice) => slice.quantity > 0)
	);
	const rarityDist = $derived(
		rarityComposition(deck.entries).filter((slice) => slice.quantity > 0)
	);
	const eddiable = $derived(eddiableStat(deck.entries));
	const eddiablePercent = $derived(
		eddiable.totalQuantity === 0 ? 0 : (eddiable.eddiableQuantity / eddiable.totalQuantity) * 100
	);

	// Text and image export (`docs/spec/deckbuilder.md` §6) — both built from what's already on
	// the page; no server route. Text has two formats behind one dropdown: a line list matching
	// cyberpunk-tcg-sim.online's own import format, and a standardized JSON alternative. Image
	// export opens a preview dialog rather than downloading straight away, so the user can also
	// just right-click-copy the composited image.
	// Widths match each panel's own `w-56`/`w-40` — `menuPosition` needs them to clamp against,
	// since the panels are now positioned via inline `style`, not `absolute right-0`/`left-0`
	// (which broke down once the trigger wasn't guaranteed to be the row's rightmost item, or the
	// row wasn't guaranteed wider than the panel — see `#lib/menu-position.js`).
	const EXPORT_MENU_WIDTH = 224;
	const ROW_MENU_WIDTH = 160;

	let exportMenuOpen = $state(false);
	let exportMenuPos = $state<{ top: number; left: number } | null>(null);
	let exportStatus = $state<'idle' | 'copied' | 'copy-failed'>('idle');

	let imageDialogEl: HTMLDialogElement;
	let imagePreviewUrl = $state<string | null>(null);
	let imageBlob: Blob | null = null;

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function copyExport(text: string) {
		exportMenuOpen = false;
		try {
			await navigator.clipboard.writeText(text);
			exportStatus = 'copied';
		} catch {
			exportStatus = 'copy-failed';
		}
		setTimeout(() => (exportStatus = 'idle'), 1500);
	}

	function downloadExport(text: string, mimeType: string, extension: string) {
		exportMenuOpen = false;
		downloadBlob(new Blob([text], { type: mimeType }), `${data.deckName}.${extension}`);
	}

	function copySimFormat() {
		copyExport(deckToSimFormat(deck.legends, mainGroups));
	}
	function downloadSimFormat() {
		downloadExport(deckToSimFormat(deck.legends, mainGroups), 'text/plain', 'txt');
	}
	function copyJson() {
		copyExport(deckToJson(data.deckName, deck.legends, mainGroups));
	}
	function downloadJson() {
		downloadExport(deckToJson(data.deckName, deck.legends, mainGroups), 'application/json', 'json');
	}

	async function openImageDialog() {
		const blob = await composeDeckImage({
			deckName: data.deckName,
			ownerName: data.ownerName,
			legends: deck.legends,
			mainGroups,
			shareUrl: window.location.href
		});
		if (!blob) return;
		imageBlob = blob;
		imagePreviewUrl = URL.createObjectURL(blob);
		imageDialogEl.showModal();
	}

	function handleImageDialogClose() {
		if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
		imagePreviewUrl = null;
		imageBlob = null;
	}

	function downloadPreviewImage() {
		if (imageBlob) downloadBlob(imageBlob, `${data.deckName}.png`);
	}

	// Row operations (`docs/spec/deckbuilder.md` §8) reachable from the deck's own view, not
	// just the `/decks` list — owner-only. Rename and visibility are inline, matching the
	// title/badge they replace; duplicate and delete live behind a small "⋯" menu.
	let renaming = $state(false);
	// svelte-ignore state_referenced_locally
	let renameValue = $state(data.deckName);

	let rowMenuOpen = $state(false);
	let rowMenuPos = $state<{ top: number; left: number } | null>(null);
	let deleteDialogEl: HTMLDialogElement;

	function startRename() {
		renameValue = data.deckName;
		renaming = true;
	}
</script>

<!--
	No `image`: a single card is a misleading preview for a deck, and a real per-deck composite
	(deck name + Legends + card grid) needs server-side rendering — satori + a WASM PNG renderer —
	which plausibly exceeds Cloudflare Workers' Free plan 10ms/request CPU cap. Revisit once on
	Paid ($5/mo, 30s-5min cap).
-->
<Meta
	title="{data.deckName} — novastack"
	description="A {deck.totalCards}-card Cyberpunk TCG deck by {data.ownerName}."
	origin={data.origin}
	path="/decks/{data.deckId}"
/>

<!--
	The extra plain wrapper matters: `<main>` (root layout) is a column flex container, and a
	`mx-auto max-w-[…]` box that is a *direct* flex child has its stretch behavior disabled by its
	own auto margins — the box shrink-wraps to content width instead of filling up to `max-w`,
	and that content-dependent width is exactly what made the List/Gallery toggle visibly resize
	the page. `/cards` sidesteps this the same way, with its own plain wrapper div.
-->
<div>
	<div class="mx-auto max-w-[1800px] px-4 py-6 sm:px-6">
		<div class="grid gap-6 lg:grid-cols-[240px_1fr_280px]">
			<!-- Preview panel — `lg:` and up only. Below that, tapping a card already navigates to
			     its own `/cards/[slug]` page (a real `<a>`, not a hover-only preview trigger), so
			     this panel has no mobile equivalent to serve as a substitute for — it was just dead
			     weight pushing the real content down a screen's worth of scroll. -->
			<div class="hidden lg:sticky lg:top-6 lg:block lg:self-start">
				{#if shown}
					<div class="card-frame overflow-hidden rounded-lg border border-edge">
						<CardImage
							printingId={shown.printings[0].id}
							thumbhash={shown.printings[0].thumbhash}
							color={shown.color}
							alt={shown.name}
							sizes="240px"
						/>
					</div>
					<p class="mt-2 text-sm font-medium uppercase {COLOR_TEXT[shown.color]}">
						{shownNameParts?.name}
					</p>
					{#if shownNameParts?.subtitle}
						<p class="text-xs font-medium tracking-wide text-muted uppercase">
							{shownNameParts.subtitle}
						</p>
					{/if}

					<div class="mt-2">
						<CardMetaBadges card={shown} compact />
					</div>

					<CardStats card={shown} showCost={false} class="mt-2" />
				{:else}
					<div
						class="flex card-frame items-center justify-center rounded-lg border border-edge
						bg-surface text-sm text-muted"
					>
						No cards yet
					</div>
				{/if}
			</div>

			<!-- Main column -->
			<div class="min-w-0">
				<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
					<div class="min-w-0">
						{#if renaming}
							<form
								method="POST"
								action="?/rename"
								use:enhance={() => {
									renaming = false;
								}}
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
									class="w-full rounded border border-edge bg-void px-2 py-1 text-xl font-semibold
										text-bright"
									autofocus
								/>
							</form>
						{:else if data.isOwner}
							<button
								type="button"
								onclick={startRename}
								class="truncate text-left text-xl font-semibold text-bright hover:text-neon"
								>{data.deckName}</button
							>
						{:else}
							<h1 class="truncate text-xl font-semibold text-bright">{data.deckName}</h1>
						{/if}
						<div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
							<span>by {data.ownerName}</span>
							<span>·</span>
							{#if data.isOwner}
								<form method="POST" action="?/visibility" use:enhance>
									<select
										name="visibility"
										value={data.visibility}
										onchange={(event) => event.currentTarget.form?.requestSubmit()}
										class="rounded border border-edge bg-void px-1 py-0.5 text-xs capitalize"
									>
										<option value="private">Private</option>
										<option value="unlisted">Unlisted</option>
										<option value="public">Public</option>
									</select>
								</form>
							{:else}
								<span class="capitalize">{data.visibility}</span>
							{/if}
							<span>·</span>
							{#if data.isOwner}
								<span class="flex items-center gap-1">
									<svg
										viewBox="0 0 20 20"
										class="size-3.5"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<path
											d="M10 17s-6.5-4.03-6.5-8.5A3.5 3.5 0 0 1 10 6.5a3.5 3.5 0 0 1 6.5 2c0 4.47-6.5 8.5-6.5 8.5Z"
										/>
									</svg>
									{data.likeCount}
								</span>
							{:else}
								<form method="POST" action="?/toggleLike" use:enhance>
									<input type="hidden" name="liked" value={data.viewerHasLiked} />
									<button
										type="submit"
										class="flex items-center gap-1 rounded-full border border-edge px-2 py-0.5
											hover:border-neon hover:text-neon"
										class:text-neon={data.viewerHasLiked}
										class:text-muted={!data.viewerHasLiked}
									>
										<svg
											viewBox="0 0 20 20"
											class="size-3.5"
											fill={data.viewerHasLiked ? 'currentColor' : 'none'}
											stroke="currentColor"
											stroke-width="1.5"
										>
											<path
												d="M10 17s-6.5-4.03-6.5-8.5A3.5 3.5 0 0 1 10 6.5a3.5 3.5 0 0 1 6.5 2c0 4.47-6.5 8.5-6.5 8.5Z"
											/>
										</svg>
										{data.likeCount}
									</button>
								</form>
							{/if}
						</div>
					</div>
					<div class="flex w-full shrink-0 items-center gap-2 sm:w-auto">
						<div class="relative">
							<button
								type="button"
								onclick={(event) => {
									if (exportMenuOpen) {
										exportMenuOpen = false;
									} else {
										exportMenuPos = menuPosition(event.currentTarget, EXPORT_MENU_WIDTH);
										exportMenuOpen = true;
									}
								}}
								class="rounded-md border border-edge px-3 py-1.5 text-sm text-body
									hover:border-neon hover:text-neon"
							>
								{exportStatus === 'copied'
									? 'Copied!'
									: exportStatus === 'copy-failed'
										? 'Copy failed'
										: 'Export text ▾'}
							</button>
							{#if exportMenuOpen && exportMenuPos}
								<button
									type="button"
									aria-label="Close export menu"
									onclick={() => (exportMenuOpen = false)}
									class="fixed inset-0 z-10 cursor-default"
								></button>
								<div
									class="fixed z-20 rounded-md border border-edge bg-shell p-1 text-sm shadow-lg"
									style="top: {exportMenuPos.top}px; left: {exportMenuPos.left}px;
										width: {EXPORT_MENU_WIDTH}px;"
								>
									<button
										type="button"
										onclick={copySimFormat}
										class="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-raised"
										>Copy sim-format list</button
									>
									<button
										type="button"
										onclick={downloadSimFormat}
										class="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-raised"
										>Download sim-format (.txt)</button
									>
									<div class="my-1 border-t border-edge"></div>
									<button
										type="button"
										onclick={copyJson}
										class="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-raised"
										>Copy JSON</button
									>
									<button
										type="button"
										onclick={downloadJson}
										class="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-raised"
										>Download JSON (.json)</button
									>
								</div>
							{/if}
						</div>
						<button
							type="button"
							onclick={openImageDialog}
							class="rounded-md border border-edge px-3 py-1.5 text-sm text-body
								hover:border-neon hover:text-neon">Deck image</button
						>
						{#if data.isOwner}
							<a
								href="/decks/{data.deckId}/edit"
								class="rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void
								hover:bg-neon-dim">Edit deck</a
							>
							<div class="relative">
								<button
									type="button"
									aria-label="Deck actions"
									onclick={(event) => {
										if (rowMenuOpen) {
											rowMenuOpen = false;
										} else {
											rowMenuPos = menuPosition(event.currentTarget, ROW_MENU_WIDTH);
											rowMenuOpen = true;
										}
									}}
									class="rounded-md border border-edge px-2 py-1.5 text-sm text-body
										hover:border-neon hover:text-neon"
								>
									⋯
								</button>
								{#if rowMenuOpen && rowMenuPos}
									<button
										type="button"
										aria-label="Close deck actions"
										onclick={() => (rowMenuOpen = false)}
										class="fixed inset-0 z-10 cursor-default"
									></button>
									<div
										class="fixed z-20 rounded-md border border-edge bg-shell p-1 text-sm shadow-lg"
										style="top: {rowMenuPos.top}px; left: {rowMenuPos.left}px;
											width: {ROW_MENU_WIDTH}px;"
									>
										<form
											method="POST"
											action="?/duplicate"
											use:enhance={() => {
												rowMenuOpen = false;
											}}
										>
											<button
												type="submit"
												class="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-raised"
												>Duplicate</button
											>
										</form>
										<button
											type="button"
											onclick={() => {
												rowMenuOpen = false;
												deleteDialogEl.showModal();
											}}
											class="block w-full rounded px-2 py-1.5 text-left text-card-red
												hover:bg-raised">Delete</button
										>
									</div>
								{/if}
							</div>
						{:else}
							<!-- Non-owner counterpart to "Edit deck" — copying someone else's public/unlisted
							     deck is a legitimate way to start a build, and the whole point is skipping
							     re-entering every card by hand. Always rendered regardless of sign-in state,
							     same as the like button above — `?/copy` sends a signed-out viewer to log in
							     rather than hiding the affordance. -->
							<form method="POST" action="?/copy" use:enhance>
								<button
									type="submit"
									class="rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void
										hover:bg-neon-dim">Copy to my decks</button
								>
							</form>
						{/if}
					</div>
				</div>

				{#if deck.issues.length > 0}
					<div
						class="mb-4 rounded-md border border-card-red/40 bg-card-red/10 p-3 text-sm text-card-red"
					>
						<p class="font-medium">This deck isn't legal.</p>
						<ul class="mt-1 list-disc space-y-0.5 pl-4">
							{#each deck.issues as issue (issue.kind + issue.message)}
								<li>{issue.message}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="mb-4 flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-3">
						{#each legendSlots as slot (slot)}
							{@const legend = deck.legends[slot]}
							{#if legend}
								<a
									href={resolve('/cards/[slug]', { slug: legend.slug })}
									class="card-frame w-16 shrink-0 overflow-hidden rounded-md border border-edge
										sm:w-24"
									onmouseenter={() => (focused = legend)}
								>
									<CardImage
										printingId={legend.printings[0].id}
										thumbhash={legend.printings[0].thumbhash}
										color={legend.color}
										alt={legend.name}
										sizes="96px"
									/>
								</a>
							{:else}
								<div
									class="flex card-frame w-16 shrink-0 items-center justify-center rounded-md
									border border-edge bg-surface text-muted sm:w-24"
								>
									—
								</div>
							{/if}
						{/each}
					</div>
					<!-- RAM budget in each Color's own official cost-badge art, number overlaid — instead
					     of a generic pill. -->
					<div class="flex flex-wrap gap-3">
						{#each COLORS as color (color)}
							{@const ram = deck.budget[color]}
							{#if ram > 0}
								<div class="flex flex-col items-center gap-1">
									<div class="relative h-10">
										<img src={COLOR_BADGE_IMAGE[color]} alt="" class="h-full w-auto" />
										<span
											class="absolute inset-0 flex items-center justify-center text-sm
											font-bold {COLOR_TEXT[color]}">{ram}</span
										>
									</div>
									<span class="text-[0.6rem] tracking-wide text-muted uppercase">{color}</span>
								</div>
							{/if}
						{/each}
					</div>
				</div>

				<div class="mb-3 flex items-center justify-between">
					<div class="flex items-center gap-4">
						<button
							type="button"
							onclick={() => (mainTab = 'deck')}
							class="text-sm font-medium transition-colors"
							class:text-bright={mainTab === 'deck'}
							class:text-muted={mainTab !== 'deck'}>Main Deck</button
						>
						<button
							type="button"
							onclick={() => (mainTab = 'history')}
							class="text-sm font-medium transition-colors hover:text-bright"
							class:text-bright={mainTab === 'history'}
							class:text-muted={mainTab !== 'history'}>History</button
						>
					</div>
					<div class="flex items-center gap-3">
						<span
							class="text-sm text-muted tabular-nums"
							title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards"
						>
							<span class="font-medium {sizeTone}">{deck.totalCards}</span> cards
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

				{#if mainTab === 'history'}
					<!-- Change History — replaces the Main Deck list on its own tab, not stacked below
					     it. Newest-first; no-op saves and the deck-creation version are filtered out
					     entirely (visibleHistory). Newest visible entry starts open; the rest are
					     collapsed to their timestamp until clicked, then show a GitHub-style
					     side-by-side diff (Legends, then Main Deck) rather than a full decklist. -->
					{#snippet historyThumb(
						slug: string,
						quantity: number | null,
						tone: 'red' | 'green' | 'neutral'
					)}
						{@const printing = cardPrinting(slug)}
						{@const card = dataset.bySlug.get(slug)}
						<div
							class="relative w-24 shrink-0"
							onmouseenter={() => card && (focused = card)}
							role="presentation"
						>
							<div
								class="card-frame overflow-hidden rounded-md {tone === 'red'
									? 'ring-2 ring-card-red'
									: tone === 'green'
										? 'ring-2 ring-card-green'
										: 'ring-1 ring-edge'}"
							>
								{#if printing && card}
									<CardImage
										printingId={printing.id}
										thumbhash={printing.thumbhash}
										color={card.color}
										alt={card.name}
										sizes="96px"
									/>
								{/if}
							</div>
							{#if quantity !== null}
								<span
									class="absolute -top-2 -right-2 flex size-6 items-center justify-center
										rounded-full text-xs font-bold tabular-nums {tone === 'red'
										? 'bg-card-red text-void'
										: tone === 'green'
											? 'bg-card-green text-void'
											: 'bg-raised text-body'}">{quantity}</span
								>
							{/if}
						</div>
					{/snippet}
					<ul class="flex flex-col gap-2">
						{#each visibleHistory as version (version.savedAt)}
							{@const legendRows = legendDiffRows(
								version.diff.legendsRemoved,
								version.diff.legendsAdded
							)}
							{@const cols = entryDiffColumns(version.diff.entries)}
							<li class="rounded-md border border-edge">
								<button
									type="button"
									onclick={() => toggleExpanded(version.savedAt)}
									class="flex w-full items-center justify-between px-3 py-2 text-left
										hover:bg-raised/40"
								>
									<span class="text-xs text-muted">{formatSavedAt(version.savedAt)}</span>
									<span class="text-xs text-muted"
										>{expandedVersions.has(version.savedAt) ? '▾' : '▸'}</span
									>
								</button>
								{#if expandedVersions.has(version.savedAt)}
									<div class="border-t border-edge p-3 text-sm">
										{#if legendRows.length > 0}
											<p class="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
												Legends
											</p>
											<div
												class="mb-3 grid grid-cols-2 overflow-hidden rounded-md border
													border-edge/50"
											>
												<div class="flex flex-wrap gap-2 border-r border-edge/50 p-2">
													{#each legendRows as row, i (i)}
														{#if row.left}
															{@render historyThumb(row.left, null, 'red')}
														{/if}
													{/each}
												</div>
												<div class="flex flex-wrap gap-2 p-2">
													{#each legendRows as row, i (i)}
														{#if row.right}
															{@render historyThumb(row.right, null, 'green')}
														{/if}
													{/each}
												</div>
											</div>
										{/if}
										{#if cols.changed.length > 0 || cols.removed.length > 0 || cols.added.length > 0}
											<p class="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
												Main Deck
											</p>
											<div
												class="grid grid-cols-2 overflow-hidden rounded-md border border-edge/50"
											>
												<div class="flex flex-wrap gap-2 border-r border-edge/50 p-2">
													{#each cols.changed as row (row.left.slug)}
														{@render historyThumb(row.left.slug, row.left.quantity, 'neutral')}
													{/each}
													{#each cols.removed as item (item.slug)}
														{@render historyThumb(item.slug, item.quantity, 'red')}
													{/each}
												</div>
												<div class="flex flex-wrap gap-2 p-2">
													{#each cols.changed as row (row.right.slug)}
														{@render historyThumb(row.right.slug, row.right.quantity, 'neutral')}
													{/each}
													{#each cols.added as item (item.slug)}
														{@render historyThumb(item.slug, item.quantity, 'green')}
													{/each}
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else if deckView.value === 'list'}
					{@const columns = 'grid-cols-[2rem_6fr_1fr_1fr_1fr]'}
					<ul class="rounded-md border border-edge">
						<li
							class="grid {columns} items-center gap-2 border-b border-edge px-4 py-1
							text-[0.65rem] font-medium tracking-wide text-muted uppercase"
						>
							<span></span>
							<span>Name</span>
							<span class="text-right">Cost</span>
							<span class="text-right">Pwr</span>
							<span class="text-right">RAM</span>
						</li>
						{#each mainGroups as group (group.cardType)}
							<li
								class="border-b border-edge/50 bg-raised px-4 py-1.5 text-xs tracking-wide
								uppercase"
							>
								<span class="font-semibold text-bright">{group.label}</span>
								<span class="text-muted tabular-nums">({group.quantity})</span>
							</li>
							{#each group.entries as entry (entry.card.slug)}
								<li class="border-b border-edge/50 last:border-b-0">
									<a
										href={resolve('/cards/[slug]', { slug: entry.card.slug })}
										class="grid {columns} items-center gap-2 px-4 py-1.5 hover:bg-raised"
										onmouseenter={() => (focused = entry.card)}
									>
										<span class="text-muted tabular-nums">{entry.quantity}×</span>
										<span class="min-w-0 truncate text-sm {COLOR_TEXT[entry.card.color]}"
											>{entry.card.name}</span
										>
										<span class="text-right text-xs text-muted tabular-nums"
											>{entry.card.cost ?? '—'}</span
										>
										<span class="text-right text-xs text-muted tabular-nums"
											>{entry.card.power ?? '—'}</span
										>
										<span class="text-right text-xs tabular-nums {COLOR_TEXT[entry.card.color]}"
											>{entry.card.ramRequired ?? '—'}</span
										>
									</a>
								</li>
							{/each}
						{:else}
							<li class="p-4 text-sm text-muted">No cards yet.</li>
						{/each}
					</ul>
				{:else}
					<div>
						{#each mainGroups as group (group.cardType)}
							<p
								class="mt-3 mb-1.5 rounded-md bg-raised px-3 py-1.5 text-xs tracking-wide
								uppercase first:mt-0"
							>
								<span class="font-semibold text-bright">{group.label}</span>
								<span class="text-muted tabular-nums">{group.quantity}</span>
							</p>
							<ul class="grid grid-cols-5 gap-2">
								{#each group.entries as entry (entry.card.slug)}
									<li class="relative overflow-hidden rounded-md">
										<a
											href={resolve('/cards/[slug]', { slug: entry.card.slug })}
											class="block"
											onmouseenter={() => (focused = entry.card)}
										>
											<CardImage
												printingId={entry.card.printings[0].id}
												thumbhash={entry.card.printings[0].thumbhash}
												color={entry.card.color}
												alt={entry.card.name}
												sizes="150px"
											/>
										</a>
										<span
											class="pointer-events-none absolute top-1 right-1 flex size-5
											items-center justify-center rounded-full bg-neon text-xs font-bold
											text-void tabular-nums"
										>
											{entry.quantity}
										</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="p-4 text-sm text-muted">No cards yet.</p>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Stats sidebar -->
			<div class="flex flex-col gap-4">
				<div class="rounded-md border border-edge bg-shell p-4">
					<p class="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Cost curve</p>
					{#if curve.length === 0}
						<p class="text-xs text-muted">No cards yet.</p>
					{:else}
						<div class="flex items-end gap-1.5">
							{#each curve as bucket (bucket.cost ?? 'null')}
								<div class="flex flex-1 flex-col items-center gap-1">
									<span class="text-[0.65rem] text-muted tabular-nums">{bucket.quantity}</span>
									<div class="flex h-16 w-full items-end">
										<div
											class="w-full rounded-sm bg-neon-dim"
											style="height: {(bucket.quantity / curveMax) * 100}%"
										></div>
									</div>
									<span class="text-[0.65rem] text-muted tabular-nums">{bucket.cost ?? '—'}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="rounded-md border border-edge bg-shell p-4">
					<p class="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Colors</p>
					{#if composition.length === 0}
						<p class="text-xs text-muted">No cards yet.</p>
					{:else}
						<div class="flex h-2 overflow-hidden rounded-full bg-raised">
							{#each composition as slice (slice.color)}
								<div
									class={COLOR_TINT[slice.color]}
									style="width: {(slice.quantity / deck.totalCards) * 100}%"
								></div>
							{/each}
						</div>
						<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
							{#each composition as slice (slice.color)}
								<span class="inline-flex items-center gap-1.5">
									<span class="size-2 rounded-full {COLOR_DOT[slice.color]}"></span>{slice.color}
									{slice.quantity}
								</span>
							{/each}
						</div>
					{/if}
				</div>

				<div class="rounded-md border border-edge bg-shell p-4">
					<p class="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Eddiable</p>
					{#if eddiable.totalQuantity === 0}
						<p class="text-xs text-muted">No cards yet.</p>
					{:else}
						<div class="h-2 overflow-hidden rounded-full bg-raised">
							<div class="h-full bg-neon" style="width: {eddiablePercent}%"></div>
						</div>
						<p class="mt-3 text-xs text-muted">
							{eddiable.eddiableQuantity} of {eddiable.totalQuantity} cards ({Math.round(
								eddiablePercent
							)}%)
						</p>
					{/if}
				</div>

				<div class="rounded-md border border-edge bg-shell p-4">
					<p class="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Rarity</p>
					{#if rarityDist.length === 0}
						<p class="text-xs text-muted">No cards yet.</p>
					{:else}
						<div class="flex h-2 overflow-hidden rounded-full bg-raised">
							{#each rarityDist as slice, index (slice.rarity)}
								<div
									class={rarityTint(index, rarityDist.length)}
									style="width: {(slice.quantity / deck.totalCards) * 100}%"
								></div>
							{/each}
						</div>
						<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
							{#each rarityDist as slice, index (slice.rarity)}
								<span class="inline-flex items-center gap-1.5">
									<span class="size-2 rounded-full {rarityTint(index, rarityDist.length)}"
									></span>{slice.rarity}
									{slice.quantity}
								</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<dialog
	bind:this={imageDialogEl}
	onclose={handleImageDialogClose}
	class="w-full max-w-[84rem] rounded-lg border border-edge bg-shell p-4"
>
	{#if imagePreviewUrl}
		<img src={imagePreviewUrl} alt="{data.deckName} deck image" class="w-full rounded-md" />
		<p class="mt-2 text-xs text-muted">Right-click the image to copy it, or download it below.</p>
	{/if}
	<div class="mt-4 flex justify-end gap-2">
		<button
			type="button"
			onclick={() => imageDialogEl.close()}
			class="rounded-md border border-edge px-3 py-1.5 text-sm text-body hover:border-neon
				hover:text-neon">Close</button
		>
		<button
			type="button"
			onclick={downloadPreviewImage}
			class="rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void hover:bg-neon-dim"
			>Download image</button
		>
	</div>
</dialog>

<dialog
	bind:this={deleteDialogEl}
	class="w-full max-w-sm rounded-lg border border-edge bg-shell p-4"
>
	<p class="text-sm text-body">
		Delete <span class="font-medium text-bright">{data.deckName}</span>? This can't be undone.
	</p>
	<form
		method="POST"
		action="?/delete"
		use:enhance={() => {
			deleteDialogEl.close();
		}}
		class="mt-4 flex justify-end gap-2"
	>
		<button
			type="button"
			onclick={() => deleteDialogEl.close()}
			class="rounded-md border border-edge px-3 py-1.5 text-sm text-body hover:border-neon
				hover:text-neon">Cancel</button
		>
		<button
			type="submit"
			class="rounded-md bg-card-red px-3 py-1.5 text-sm font-medium text-void hover:opacity-90"
			>Delete</button
		>
	</form>
</dialog>
