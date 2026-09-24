<script lang="ts">
	/**
	 * One Binder — the spread.
	 *
	 * A **Binder** is a showcase: a Pocket holds a card you want to display, and says nothing about
	 * what you own (`CONTEXT.md`). So there are no steppers here and no counts; the Collection is
	 * not consulted, and the one place it appears is a quiet "not in your collection" note on the
	 * tray, which informs without editing.
	 *
	 * The interaction is the physical one: pick a card up, then put it in a pocket. Clicking a
	 * search result puts it **in hand**; every empty Pocket then reads as a target. That beats
	 * pocket-first (click a pocket, then search) because you usually know which card you're
	 * arranging before you know where it goes, and it makes filling a run of pockets one click each.
	 *
	 * Drag-and-drop **swaps** rather than overwrites, matching `movePocket` — dragging one card onto
	 * another in a real binder trades their places.
	 *
	 * Empty Pockets are rendered for everyone, owner or not: a held space is part of the
	 * arrangement, not an artefact to tidy away before sharing.
	 */
	import { flushSync } from 'svelte';
	import { enhance } from '$app/forms';
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';
	import { POCKETS_PER_PAGE } from '#lib/collection/binders.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import {
		printingRow,
		searchPrintings,
		setLabel,
		type PrintingRow
	} from '#lib/collection/printing-search.js';

	let { data, form } = $props();

	/** The card in hand: picked from the tray, waiting for a Pocket. */
	let held = $state<PrintingRow | null>(null);
	let term = $state('');
	let renaming = $state(false);
	let copied = $state(false);

	const matches = $derived(searchPrintings(term.trim()));

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
	 * The Collection is loaded only to annotate the tray. Harmless for a signed-out visitor
	 * following a shared link: `load` no-ops without a session.
	 */
	$effect(() => void collection.load());

	/** Drag-and-drop submits through one hidden form, so the move takes the same validated action
	 * path as everything else rather than a bespoke fetch. */
	let moveForm = $state<HTMLFormElement>();
	let move = $state({ page: 0, pocket: 0, toPage: 0, toPocket: 0 });
	let dragging = $state<{ page: number; pocket: number } | null>(null);

	function onDrop(toPage: number, toPocket: number) {
		if (!dragging) return;

		// `flushSync`, not a bare assignment: `requestSubmit` reads the hidden inputs straight out of
		// the DOM, and Svelte's update is batched — so submitting in the same tick sent the *previous*
		// values. That defaulted to 0,0 → 0,0, which `movePocket` correctly treats as a no-op, and
		// every drag silently did nothing.
		const from = dragging;
		flushSync(() => {
			move = { page: from.page, pocket: from.pocket, toPage, toPocket };
		});

		dragging = null;
		moveForm?.requestSubmit();
	}

	async function copyLink() {
		await navigator.clipboard.writeText(`${data.origin}/binders/${data.binder.id}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<Meta
	title="{data.binder.name} — novastack"
	description="A binder of {filled} cards, arranged by {data.binder.ownerName}."
	origin={data.origin}
	path="/binders/{data.binder.id}"
/>

<div class="mx-auto max-w-7xl p-6 sm:p-9">
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

	{#if form?.message}
		<p
			class="mb-4 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body"
		>
			{form.message}
		</p>
	{/if}

	<div class="flex flex-col gap-8 lg:flex-row">
		<div class="min-w-0 flex-1 space-y-8">
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
						class="grid grid-cols-3 gap-3 rounded-xl border border-edge bg-shell p-3
							sm:gap-4 sm:p-4"
					>
						{#each pockets as printingId, pocket (pocket)}
							{@const row = printingId ? printingRow(printingId) : undefined}
							<!-- The drop target is the `li`, not the pocket inside it: an empty Pocket's button is
							     `disabled` until you are holding a card, and Chromium dispatches no drag events
							     over a disabled control — dropping onto one silently did nothing until these
							     handlers moved out here. -->
							<li
								ondragover={(event) => data.isOwner && event.preventDefault()}
								ondrop={(event) => {
									event.preventDefault();
									onDrop(page, pocket);
								}}
							>
								{#if row}
									<!-- Drag is a pointer affordance and left as one: no `role="button"` or tabindex,
									     which would announce an action the keyboard cannot perform. Rearranging
									     without a mouse is emptying a pocket and placing again, which works
									     throughout. -->
									<div
										class="group/pocket relative"
										role="group"
										aria-label="{row.card.name}, pocket {pocket + 1} on page {page + 1}"
										draggable={data.isOwner}
										ondragstart={(event) => {
											dragging = { page, pocket };
											// Chromium refuses to start a drag with an empty `dataTransfer`, so the
											// payload is set even though `dragging` is what the drop actually reads:
											// the cross-window drop this enables is a no-op elsewhere, and a drag
											// that never starts is worse.
											event.dataTransfer?.setData('text/plain', row.printing.id);
											if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
										}}
										ondragend={() => (dragging = null)}
									>
										<CardImage
											printingId={row.printing.id}
											thumbhash={row.printing.thumbhash}
											color={row.card.color}
											alt={row.card.name}
											sizes="(min-width: 640px) 200px, 30vw"
											class="rounded-lg"
										/>
										{#if data.isOwner}
											<form
												method="POST"
												action="?/clear"
												use:enhance
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
											title={held ? `Put ${held.card.name} here` : 'Pick a card first'}
											class="card-frame w-full rounded-lg border-2 border-dashed transition-colors
												disabled:pointer-events-none
												{held
												? 'border-neon-dim/60 text-neon hover:border-neon hover:bg-neon/5'
												: 'border-edge text-transparent'}"
										>
											<span class="text-2xl" aria-hidden="true">+</span>
											<span class="sr-only">Empty pocket {pocket + 1} on page {page + 1}</span>
										</button>
									</form>
								{:else}
									<div
										class="card-frame rounded-lg border-2 border-dashed border-edge/60"
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
			<!-- The tray. `self-start` is load-bearing: a stretched flex item has nothing for
			     `sticky` to stick to. -->
			<aside
				class="w-full shrink-0 self-start rounded-xl border border-edge bg-shell p-4 lg:sticky
					lg:top-nav lg:w-80"
			>
				<p class="text-xs font-medium tracking-widest text-muted uppercase">In hand</p>

				{#if held}
					<div class="mt-3 flex gap-3">
						<div class="w-24 shrink-0">
							<CardImage
								printingId={held.printing.id}
								thumbhash={held.printing.thumbhash}
								color={held.card.color}
								alt={held.card.name}
								sizes="96px"
								class="rounded-lg shadow-xl shadow-void"
							/>
						</div>
						<div class="min-w-0">
							<p class="truncate text-sm text-bright">{held.card.name}</p>
							<p class="font-mono text-[0.65rem] text-muted">
								{setLabel(held.printing.setId)} · {held.printing.collectorNumber}{held.printing
									.locale !== DEFAULT_LOCALE
									? ` · ${held.printing.locale.toUpperCase()}`
									: ''}
							</p>
							{#if collection.quantityOf(held.printing.id) === 0}
								<p class="mt-1 text-[0.65rem] text-muted/60">Not in your collection</p>
							{/if}
							<button
								type="button"
								onclick={() => (held = null)}
								class="mt-2 text-xs text-muted hover:text-neon">Put back</button
							>
						</div>
					</div>
					<p class="mt-3 text-xs text-neon-dim">Now click a pocket.</p>
				{:else}
					<p class="mt-2 text-xs text-muted/70">
						Search for a card, then click a pocket to place it. Drag a card between pockets to
						rearrange.
					</p>
				{/if}

				<input
					bind:value={term}
					autocomplete="off"
					spellcheck="false"
					placeholder="Collector number, or a name…"
					class="mt-4 w-full rounded-lg border border-edge bg-surface px-3 py-2 font-mono text-sm
						text-bright placeholder:text-muted/50 focus:border-neon focus:outline-none"
				/>

				{#if matches.length > 0}
					<ul class="mt-2 max-h-96 overflow-y-auto">
						{#each matches as row (row.printing.id)}
							<li>
								<button
									type="button"
									onclick={() => (held = row)}
									class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm
										hover:bg-surface {held?.printing.id === row.printing.id ? 'bg-raised' : ''}"
								>
									<span class="w-12 shrink-0 font-mono text-xs text-neon tabular-nums"
										>{row.printing.collectorNumber}</span
									>
									<span class="min-w-0 flex-1 truncate text-body">{row.card.name}</span>
									<span class="shrink-0 font-mono text-[0.65rem] text-muted"
										>{setLabel(row.printing.setId)}</span
									>
									<!-- Without the locale, two printings that differ only by language render as
									     identical rows and there is no way to pick the one you meant. -->
									{#if row.printing.locale !== DEFAULT_LOCALE}
										<span class="shrink-0 font-mono text-[0.6rem] text-muted/70"
											>{row.printing.locale.toUpperCase()}</span
										>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{:else if term.trim().length > 0}
					<p class="mt-2 px-2 text-sm text-muted">No printing matches “{term.trim()}”.</p>
				{/if}
			</aside>
		{/if}
	</div>

	{#if data.isOwner}
		<!-- Drag-and-drop's submit path. Outside the grid so a drop between pages still finds it. -->
		<form method="POST" action="?/move" use:enhance bind:this={moveForm} class="hidden">
			<input type="hidden" name="page" value={move.page} />
			<input type="hidden" name="pocket" value={move.pocket} />
			<input type="hidden" name="toPage" value={move.toPage} />
			<input type="hidden" name="toPocket" value={move.toPocket} />
		</form>
	{/if}
</div>
