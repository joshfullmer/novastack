<script lang="ts">
	/**
	 * One Binder — the spread.
	 *
	 * A **Binder** is a showcase: a Pocket holds a card you want to display, and says nothing about
	 * what you own (`CONTEXT.md`). So there are no steppers here and no counts; the Collection is
	 * only ever read, to mark which search results you already have.
	 *
	 * **Three ways to fill a Pocket, on purpose.** Drag a card in (the good one, see
	 * `#lib/collection/pocket-drag.svelte.ts`); or pick a card up with a click and click a Pocket,
	 * which is the path that works without a pointer and without JavaScript for the click half; or
	 * rearrange what's already there by dragging between Pockets. Dropping onto an occupied Pocket
	 * **swaps**, matching `movePocket` — trading places is what moving a card in a real binder does.
	 *
	 * **The search panel is the full query language**, not a name box: `rarity>=epic`, `set:MS01-WNC`,
	 * `owned>=1`, `type:legend` and the rest, with the same highlighting and autocomplete as
	 * `/cards`.
	 * Building a themed page is a *set-shaped* question — "every epic in The Heist I own" — which is
	 * exactly what the query language answers and what a name box cannot. Its text stays in
	 * component state rather than the URL: this page's URL is a share link, and a stranger opening it
	 * should get the arrangement, not your last search.
	 *
	 * Empty Pockets are rendered for everyone, owner or not: a held space is part of the
	 * arrangement, not an artefact to tidy away before sharing.
	 */
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { dataset } from '#lib/cards/index.js';
	import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';
	import { POCKETS_PER_PAGE } from '#lib/collection/binders.js';
	import {
		PocketDrag,
		POCKET_ATTRIBUTE,
		REMOVE_ATTRIBUTE,
		pocketKey,
		type DragPayload,
		type DropZone
	} from '#lib/collection/pocket-drag.svelte.js';
	import {
		PRINTING_ROWS_IN_SET_ORDER,
		printingRow,
		setLabel,
		type PrintingRow
	} from '#lib/collection/printing-search.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import { test } from '#lib/filters/predicate.js';
	import { parseQuery } from '#lib/query/index.js';
	import CardImage from '#lib/components/CardImage.svelte';
	import DragGhost from '#lib/components/DragGhost.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import QueryEditor from '#lib/components/filters/QueryEditor.svelte';

	let { data, form } = $props();

	/** The card in hand: picked from the search panel, waiting for a Pocket. */
	let held = $state<PrintingRow | null>(null);
	let renaming = $state(false);
	let copied = $state(false);
	/** A failed drag-drop has no form to report through, so it reports here. */
	let dropError = $state<string | null>(null);

	/**
	 * Trailing empty Pages exist only on screen until something is put in them — `getBinderPages`
	 * derives the count from the highest occupied Pocket, so "added but empty" has no storage and
	 * needs none. Tracked as a floor rather than a count so a placement that grows the server's
	 * pages can't shrink the view.
	 */
	let pageFloor = $state(1);
	const pageCount = $derived(Math.max(data.pages.length, pageFloor));

	const pages = $derived(
		Array.from(
			{ length: pageCount },
			(_, page) => data.pages[page] ?? Array.from({ length: POCKETS_PER_PAGE }, () => null)
		)
	);

	const filled = $derived(data.pages.flat().filter((pocket) => pocket !== null).length);

	/**
	 * The Collection is read only to annotate search results. Harmless for a signed-out visitor
	 * following a shared link: `load` no-ops without a session.
	 */
	$effect(() => void collection.load());

	const ownedOf = (printingId: string) => collection.quantityOf(printingId);

	// ---------------------------------------------------------------------------------------------
	// Search panel

	/** Result cap. High enough to browse a whole set page-by-page, low enough not to decode 700
	 * images into a 320px-wide column. */
	const RESULT_CAP = 72;

	let source = $state('');
	const parsed = $derived(parseQuery(source, dataset));

	const matched = $derived(
		// `test` per (card, printing), not `evaluate`: that returns one match per *Card* with a
		// witness printing, and a Binder holds a specific printing of a card, not the card.
		PRINTING_ROWS_IN_SET_ORDER.filter((row) =>
			test(parsed.predicate, dataset, row.card, row.printing, ownedOf)
		)
	);
	const results = $derived(matched.slice(0, RESULT_CAP));

	/** Starter queries, because an empty box doesn't teach a language. Real field names and real
	 * values — checked against `FIELDS` in `#lib/query/vocabulary.ts` and the dataset's set ids. */
	const examples = ['owned>=1', 'rarity>=epic', 'set:MS01-WNC', 'type:legend'];

	// ---------------------------------------------------------------------------------------------
	// Dragging

	const drag = new PocketDrag({ onDrop: commitDrop });
	onDestroy(() => drag.destroy());

	/**
	 * Posts the drop to the same form actions the buttons use, by hand.
	 *
	 * A drag has no `<form>` to submit — an earlier version kept a hidden one and called
	 * `requestSubmit`, which needed a `flushSync` to stop it reading last render's values. This is
	 * the documented manual path instead: `fetch` the action, `deserialize` the result, invalidate.
	 * Validation stays server-side, so a hand-crafted drop is no more trusted than a click.
	 */
	async function commitDrop(payload: DragPayload, zone: DropZone): Promise<void> {
		const body = new FormData();
		let action: 'move' | 'place' | 'clear';

		if (zone.kind === 'remove') {
			// Only a Pocket can be removed from; the engine won't offer this zone for a search card.
			if (payload.kind !== 'pocket') return;
			action = 'clear';
			body.set('page', String(payload.page));
			body.set('pocket', String(payload.pocket));
		} else if (payload.kind === 'pocket') {
			action = 'move';
			body.set('page', String(payload.page));
			body.set('pocket', String(payload.pocket));
			body.set('toPage', String(zone.page));
			body.set('toPocket', String(zone.pocket));
		} else {
			action = 'place';
			body.set('page', String(zone.page));
			body.set('pocket', String(zone.pocket));
			body.set('printingId', payload.printingId);
		}

		dropError = null;
		const response = await fetch(`?/${action}`, { method: 'POST', body });
		const result = deserialize(await response.text());

		if (result.type === 'failure') {
			dropError = typeof result.data?.message === 'string' ? result.data.message : 'Drop failed.';
			return;
		}

		if (result.type === 'success') await invalidateAll();
		await applyAction(result);
	}

	/** A Pocket's contents while a drag is in the air: the card it holds, minus the one that left. */
	function pocketContents(page: number, pocket: number, printingId: string | null) {
		if (!printingId) return undefined;
		if (drag.sourceKey === pocketKey(page, pocket)) return undefined;
		return printingRow(printingId);
	}

	// ---------------------------------------------------------------------------------------------

	async function copyLink() {
		await navigator.clipboard.writeText(`${data.origin}/collection/binders/${data.binder.id}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<Meta
	title="{data.binder.name} — novastack"
	description="A binder of {filled} cards, arranged by {data.binder.ownerName}."
	origin={data.origin}
	path="/collection/binders/{data.binder.id}"
/>

<DragGhost {drag} />

<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
	<div class="min-w-0">
		<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Binder</p>
		{#if renaming}
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => {
					renaming = false;
					return async ({ update }) => update();
				}}
				class="mt-1 flex items-center gap-2"
			>
				<input
					name="name"
					value={data.binder.name}
					required
					maxlength="60"
					class="rounded-md border border-edge bg-surface px-3 py-1.5 text-2xl font-bold text-bright"
				/>
				<button type="submit" class="text-sm text-neon hover:text-bright">Save</button>
			</form>
		{:else}
			<h1 class="mt-1 truncate text-4xl font-bold tracking-tight text-bright">
				{data.binder.name}
			</h1>
		{/if}
		<p class="mt-2 text-sm text-muted tabular-nums">
			{filled}
			{filled === 1 ? 'card' : 'cards'} · {pageCount}
			{pageCount === 1 ? 'page' : 'pages'}
			{#if !data.isOwner}· arranged by {data.binder.ownerName}{/if}
		</p>
	</div>

	{#if data.isOwner}
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<a href="/collection/binders" class="px-2 py-2 text-muted hover:text-neon">All binders</a>

			{#if !renaming}
				<button
					type="button"
					onclick={() => (renaming = true)}
					class="px-2 py-2 text-muted hover:text-neon">Rename</button
				>
			{/if}

			<form method="POST" action="?/visibility" use:enhance>
				<input
					type="hidden"
					name="visibility"
					value={data.binder.visibility === 'shared' ? 'private' : 'shared'}
				/>
				<button
					type="submit"
					class="rounded-lg border border-edge px-3 py-2 text-body transition-colors
						hover:border-neon-dim hover:text-neon"
				>
					{data.binder.visibility === 'shared' ? 'Make private' : 'Share by link'}
				</button>
			</form>

			{#if data.binder.visibility === 'shared'}
				<button
					type="button"
					onclick={copyLink}
					class="rounded-lg border border-neon bg-neon/10 px-3 py-2 text-neon"
					>{copied ? 'Copied' : 'Copy link'}</button
				>
			{/if}
		</div>
	{/if}
</div>

{#if form?.message || dropError}
	<p class="mb-4 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body">
		{form?.message ?? dropError}
	</p>
{/if}

<div class="flex flex-col gap-8 lg:flex-row">
	<div class="min-w-0 flex-1 space-y-10">
		{#each pages as pockets, page (page)}
			<section>
				<div class="mb-2 flex items-baseline gap-3">
					<h2 class="font-mono text-xs tracking-widest text-muted uppercase tabular-nums">
						Page {page + 1}
					</h2>
					{#if data.isOwner && pageCount > 1}
						<form
							method="POST"
							action="?/removePage"
							use:enhance={() => {
								// Keeps the floor in step, so removing an on-screen-only page works too.
								pageFloor = Math.max(1, pageCount - 1);
								return async ({ update }) => update();
							}}
							class="ml-auto"
						>
							<input type="hidden" name="page" value={page} />
							<button type="submit" class="text-xs text-muted hover:text-card-red"
								>Remove page</button
							>
						</form>
					{/if}
				</div>

				<ul
					class="grid grid-cols-3 gap-3 rounded-xl border border-edge bg-shell p-3 sm:gap-4 sm:p-4"
				>
					{#each pockets as printingId, pocket (pocket)}
						{@const row = pocketContents(page, pocket, printingId)}
						{@const key = pocketKey(page, pocket)}
						{@const isTarget = drag.overKey === key}
						<!--
							`data-pocket` is the drop target: `PocketDrag` hit-tests with
							`elementFromPoint`, so the target has to be a real element under the cursor with
							the coordinates of the Pocket itself — which is this `li`, whether the Pocket is
							full or empty.
						-->
						<li
							{...{ [POCKET_ATTRIBUTE]: key }}
							class="relative rounded-2xl transition-shadow {isTarget
								? 'ring-2 ring-neon ring-offset-2 ring-offset-shell'
								: ''}"
						>
							{#if row}
								<!--
									Drag is a pointer affordance and left as one: no `role="button"` or tabindex,
									which would announce an action the keyboard cannot perform. Rearranging
									without a pointer is emptying a Pocket and placing again, which works
									throughout.

									`ondragstart` is cancelled because the card art is an `<img>`, and the
									browser's own image drag would otherwise fight the real one for the gesture.
								-->
								<!--
									Veiled when the owner owns no copies (`card-veil` in `layout.css`), and only for
									the owner: a Binder says nothing about ownership, so veiling a stranger's view
									by *their* collection would read as a claim about the owner's.
								-->
								<!-- The radius is repeated on this wrapper, not only on the art: `card-veil`'s
								     sheet inherits its `border-radius`, so a square wrapper would put square
								     corners over a rounded card. -->
								<div
									class="group/pocket relative rounded-2xl select-none
										{data.isOwner && ownedOf(row.printing.id) === 0 ? 'card-veil' : ''}
										{data.isOwner ? 'cursor-grab' : ''}"
									role="group"
									aria-label="{row.card.name}, pocket {pocket + 1} on page {page + 1}"
									onpointerdown={(event) => {
										if (data.isOwner) {
											drag.press(event, {
												kind: 'pocket',
												page,
												pocket,
												printingId: row.printing.id
											});
										}
									}}
									ondragstart={(event) => event.preventDefault()}
								>
									<CardImage
										printingId={row.printing.id}
										thumbhash={row.printing.thumbhash}
										color={row.card.color}
										alt={row.card.name}
										sizes="(min-width: 1024px) 240px, 30vw"
										class="rounded-2xl"
									/>
									{#if data.isOwner}
										<form
											method="POST"
											action="?/clear"
											use:enhance
											onpointerdown={(event) => event.stopPropagation()}
											class="absolute top-1 right-1 opacity-0 transition-opacity
												group-hover/pocket:opacity-100 has-[:focus-visible]:opacity-100"
										>
											<input type="hidden" name="page" value={page} />
											<input type="hidden" name="pocket" value={pocket} />
											<button
												type="submit"
												title="Empty this pocket"
												class="rounded bg-void/90 px-1.5 py-0.5 text-xs text-muted
													hover:text-card-red">✕</button
											>
										</form>
									{/if}
								</div>
							{:else if data.isOwner}
								<form
									method="POST"
									action="?/place"
									use:enhance={() => {
										// The card stays in hand, so filling a run of pockets is one click each.
										return async ({ update }) => update({ reset: false });
									}}
								>
									<input type="hidden" name="page" value={page} />
									<input type="hidden" name="pocket" value={pocket} />
									<input type="hidden" name="printingId" value={held?.printing.id ?? ''} />
									<button
										type="submit"
										disabled={!held}
										title={held
											? `Put ${held.card.name} here`
											: 'Pick a card first, or drag one in'}
										class="card-frame w-full rounded-2xl border-2 border-dashed transition-colors
											disabled:pointer-events-none {held
											? 'border-neon-dim/60 text-neon hover:border-neon hover:bg-neon/5'
											: 'border-edge text-transparent'}"
									>
										<span class="text-2xl" aria-hidden="true">+</span>
										<span class="sr-only">Empty pocket {pocket + 1} on page {page + 1}</span>
									</button>
								</form>
							{:else}
								<div
									class="card-frame rounded-2xl border-2 border-dashed border-edge/60"
									aria-label="Empty pocket"
								></div>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if data.isOwner}
			<button
				type="button"
				onclick={() => (pageFloor = pageCount + 1)}
				class="w-full rounded-xl border border-dashed border-edge py-4 text-sm text-muted
					transition-colors hover:border-neon-dim hover:text-neon">+ Add page</button
			>
		{/if}
	</div>

	{#if data.isOwner}
		<!-- `self-start` is load-bearing: a stretched flex item has nothing for `sticky` to stick to.
		     The panel scrolls inside itself so the spread can be scrolled past it. -->
		<!-- Side by side from `lg`, not `xl`. Stacked, the panel sits below the spread and every
		     placement becomes a scroll — and `/collection/add` already taught this lesson once, where
		     an `xl` gate meant most windows never saw the preview at all. -->
		<aside
			{...{ [REMOVE_ATTRIBUTE]: '' }}
			class="relative w-full shrink-0 self-start rounded-xl border bg-shell transition-colors
				lg:sticky lg:top-nav lg:max-h-[calc(100vh-var(--spacing-nav)-1rem)] lg:w-80
				lg:overflow-y-auto xl:w-96 {drag.overRemove ? 'border-card-red bg-card-red/5' : 'border-edge'}"
		>
			{#if drag.payload?.kind === 'pocket'}
				<!-- Only while a card that's *in* the Binder is in the air: dragging a search result back
				     here does nothing, so promising otherwise would be a lie. -->
				<p
					class="sticky top-0 z-20 -mb-px border-b px-4 py-2 text-center text-xs transition-colors
						{drag.overRemove
						? 'border-card-red bg-card-red/15 text-bright'
						: 'border-edge bg-shell text-muted'}"
				>
					{drag.overRemove ? 'Release to take it out of the binder' : 'Drop here to remove'}
				</p>
			{/if}
			<div class="sticky top-0 z-10 space-y-3 border-b border-edge bg-shell p-4">
				<div class="flex items-baseline justify-between gap-2">
					<p class="text-xs font-medium tracking-widest text-muted uppercase">Add cards</p>
					<span class="font-mono text-[0.65rem] text-muted/70 tabular-nums">
						{#if matched.length > results.length}
							{results.length} of {matched.length}
						{:else}
							{matched.length} printings
						{/if}
					</span>
				</div>

				<QueryEditor
					id="binder-query"
					value={source}
					placeholder="Query — try rarity>=epic owned>=1"
					warnings={parsed.warnings}
					onSource={(next) => (source = next)}
				/>

				{#if source.trim() === ''}
					<div class="flex flex-wrap gap-1.5">
						{#each examples as example (example)}
							<button
								type="button"
								onclick={() => (source = example)}
								class="rounded-full border border-edge px-2 py-0.5 font-mono text-[0.65rem]
									text-muted transition-colors hover:border-neon-dim hover:text-neon">{example}</button
							>
						{/each}
					</div>
				{/if}

				{#if held}
					<div class="flex items-center gap-2 rounded-lg border border-neon/40 bg-neon/5 p-2">
						<div class="w-10 shrink-0">
							<CardImage
								printingId={held.printing.id}
								thumbhash={held.printing.thumbhash}
								color={held.card.color}
								alt=""
								sizes="40px"
								class="rounded"
							/>
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs text-bright">{held.card.name}</p>
							<p class="text-[0.65rem] text-neon-dim">In hand — click a pocket</p>
						</div>
						<button
							type="button"
							onclick={() => (held = null)}
							class="shrink-0 text-xs text-muted hover:text-neon">Put back</button
						>
					</div>
				{:else}
					<p class="text-[0.7rem] text-muted/70">
						Drag a card into a pocket, or click it to pick it up.
					</p>
				{/if}
			</div>

			{#if results.length === 0}
				<p class="p-4 text-sm text-muted">Nothing matches that query.</p>
			{:else}
				<ul class="grid grid-cols-3 gap-2 p-4">
					{#each results as row (row.printing.id)}
						{@const owned = ownedOf(row.printing.id)}
						<li>
							<button
								type="button"
								onpointerdown={(event) =>
									drag.press(event, { kind: 'search', printingId: row.printing.id })}
								ondragstart={(event) => event.preventDefault()}
								onclick={() => {
									// A drag ends in a click on the element it started from; that click isn't one.
									if (!drag.justDragged) held = held?.printing.id === row.printing.id ? null : row;
								}}
								title="{row.card.name} · {setLabel(row.printing.setId)} {row.printing
									.collectorNumber}{row.printing.locale !== DEFAULT_LOCALE
									? ` · ${row.printing.locale.toUpperCase()}`
									: ''}"
								class="relative block w-full cursor-grab rounded-lg transition-transform select-none
									hover:-translate-y-0.5 {owned === 0 ? 'card-veil' : ''} {held?.printing.id === row.printing.id
									? 'ring-2 ring-neon'
									: ''}"
							>
								<CardImage
									printingId={row.printing.id}
									thumbhash={row.printing.thumbhash}
									color={row.card.color}
									alt={row.card.name}
									sizes="110px"
									class="rounded-lg"
								/>
								<span
									class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1
										rounded-b-lg bg-void/85 px-1 py-0.5 font-mono text-[0.55rem] text-muted tabular-nums"
								>
									<span class="truncate">{row.printing.collectorNumber}</span>
									{#if owned > 0}<span class="ml-auto text-neon-dim">×{owned}</span>{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	{/if}
</div>
