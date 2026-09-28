<script lang="ts">
	/**
	 * Everything you can do to one card in a deck — copies in each pile, which Printing, removal —
	 * in a surface big enough to show the art you're choosing between.
	 *
	 * **Why a modal and not controls in the row.** Two variant rounds established it: a 360px rail
	 * can't host a per-entry control at a size worth clicking, and a printings grid for a card with
	 * fourteen of them needs real space. The row became a target instead, which also retired a
	 * destructive default — a single click on a Gallery tile used to remove a copy with no
	 * confirmation and no undo. Removal is a labelled button here.
	 *
	 * **Legends are a different shape** and handled in the same place: they occupy one of three
	 * slots rather than carrying a quantity, so there are no copy steppers and removal frees the
	 * slot. Their Printing matters most of all — Legends are the art a deck is recognised by, and
	 * what the export image and deck tiles show.
	 *
	 * Copies mutate deck state directly, which is local until the editor's Save; nothing here
	 * writes to the server.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { printTreatment } from '#lib/cards/derive.js';
	import { LOCALES, type Locale } from '#lib/cards/vocabulary.js';
	import { setLabel } from '#lib/collection/printing-search.js';
	import { cardBySlug, type DeckState } from '#lib/decks/deck-state.svelte.js';
	import { MAX_COPIES, SIDEBOARD_SIZE } from '#lib/decks/legality.js';
	import { deckPrinting, isDefaultPrinting } from '#lib/decks/printing.js';

	let {
		slug = $bindable(null),
		deck,
		/**
		 * Whether the viewer may change Printings (`choose-printing`, `#lib/entitlements.ts`).
		 *
		 * False **hides the section outright** rather than disabling it: an unentitled user has no
		 * use for a grid of art they can't pick, and a locked control invites a click that can only
		 * disappoint. Copies and removal are ungated, so the manager still has a job.
		 *
		 * Stored choices are untouched either way — the deck keeps its art and keeps rendering it,
		 * and the editor's `save` action carries printings forward so an unentitled edit can't
		 * quietly erase them (`#lib/decks/carry-printings.ts`).
		 */
		canChoosePrinting = false
	}: { slug?: string | null; deck: DeckState; canChoosePrinting?: boolean } = $props();

	const card = $derived(slug ? cardBySlug(slug) : undefined);
	const isLegend = $derived(card?.cardType === 'Legend');
	const printing = $derived(card ? deckPrinting(card, deck.printingIdOf(card)) : null);
	const inDeck = $derived(card && !isLegend ? deck.quantityOf(card) : 0);
	const inSideboard = $derived(card && !isLegend ? deck.sideboardQuantityOf(card) : 0);
	const legendSlot = $derived(
		card ? deck.legends.findIndex((legend) => legend.slug === card.slug) : -1
	);

	/**
	 * Locale filter. `null` is "all", and the control only renders when the card actually has more
	 * than one locale — on a 14-printing Adam Smasher the French rows are most of what you scroll
	 * past, and on a single-locale card a filter would be furniture.
	 */
	let locale = $state<Locale | null>(null);
	const locales = $derived(
		card ? LOCALES.filter((code) => card.printings.some((option) => option.locale === code)) : []
	);
	const visiblePrintings = $derived(
		card ? card.printings.filter((option) => locale === null || option.locale === locale) : []
	);

	function close() {
		slug = null;
		locale = null;
	}

	/** Legends live in slots, so "remove" means clearing the slot this one occupies. */
	function removeLegend() {
		if (legendSlot !== -1) deck.setLegend(legendSlot, null);
		close();
	}
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && close()} />

{#if card && printing}
	<!-- A plain fixed backdrop rather than `<dialog>`/`showModal`: still prototype code, and the
	     real version should reuse `CardDetailOverlay`'s dialog + view-transition handling. -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
		onclick={(event) => {
			// Target check rather than `stopPropagation` on the panel: a click handler on the panel
			// would need its own keyboard handler to satisfy a11y lint, and the panel isn't a control.
			if (event.target === event.currentTarget) close();
		}}
		onkeydown={(event) => event.key === 'Enter' && close()}
		role="button"
		aria-label="Close"
		tabindex="-1"
	>
		<div
			role="dialog"
			aria-label="Manage {card.name}"
			tabindex="-1"
			class="flex max-h-[min(90vh,46rem)] w-full max-w-3xl gap-5 overflow-hidden rounded-xl border
				border-edge bg-shell p-5 shadow-2xl"
		>
			<!-- The art at a size you can actually judge — the entire reason a printing picker exists. -->
			<div class="w-56 shrink-0">
				<div class="card-frame overflow-hidden rounded-lg">
					<CardImage
						printingId={printing.id}
						thumbhash={printing.thumbhash}
						color={card.color}
						alt={card.name}
						sizes="224px"
					/>
				</div>
				<p class="mt-2 font-mono text-[0.65rem] text-muted tabular-nums">
					{setLabel(printing.setId)} · #{printing.collectorNumber} · {printTreatment(
						printing
					)}{printing.locale !== 'en' ? ` · ${printing.locale.toUpperCase()}` : ''}
				</p>
			</div>

			<div class="flex min-w-0 flex-1 flex-col">
				<div class="flex items-baseline justify-between gap-3">
					<div class="min-w-0">
						<h2 class="truncate text-lg font-semibold text-bright">{card.name}</h2>
						{#if isLegend}
							<p class="text-xs text-muted">
								Legend · slot {legendSlot + 1} of {deck.legends.length}
							</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={close}
						aria-label="Close"
						class="shrink-0 text-muted hover:text-bright">✕</button
					>
				</div>

				{#if !isLegend}
					<!-- Copies first: it's what you came for nine times out of ten, and the printing is the
					     occasional errand. Deck and Sideboard side by side because the copy cap spans both
					     (`canAddCopy`), so seeing one without the other explains nothing when `+` disables. -->
					<div class="mt-4 grid grid-cols-2 gap-3">
						{#each [{ label: 'In deck', count: inDeck, add: () => deck.addCard(card), remove: () => deck.removeCard(card), canAdd: deck.canAddCopy(card), hint: `Max ${MAX_COPIES} across both piles` }, { label: 'Sideboard', count: inSideboard, add: () => deck.addToSideboard(card), remove: () => deck.removeFromSideboard(card), canAdd: deck.canAddToSideboard(card), hint: `${deck.sideboardCards}/${SIDEBOARD_SIZE} used` }] as pile (pile.label)}
							<div class="rounded-lg border border-edge bg-void/40 p-3">
								<p class="text-xs tracking-wide text-muted uppercase">{pile.label}</p>
								<div class="mt-2 flex items-center gap-3">
									<button
										type="button"
										onclick={pile.remove}
										disabled={pile.count === 0}
										aria-label="One fewer {card.name} in {pile.label}"
										class="grid size-8 place-items-center rounded-md border border-edge text-muted
											transition-colors hover:border-card-red hover:text-card-red disabled:opacity-30"
									>
										<!-- A stroke, not a `−`: `place-items-center` centres a glyph's *line box*, and
										     `+`/`−` sit on the baseline with descender space below, so the ink lands
										     visibly low. Centred in its own viewBox is centred by construction. See
										     `QuantityStepper.svelte`, which hit this first. -->
										<svg viewBox="0 0 12 12" class="size-3.5" aria-hidden="true">
											<path
												d="M2.5 6h7"
												stroke="currentColor"
												stroke-width="1.5"
												stroke-linecap="round"
											/>
										</svg>
									</button>
									<span class="min-w-6 text-center text-xl font-semibold text-bright tabular-nums"
										>{pile.count}</span
									>
									<button
										type="button"
										onclick={pile.add}
										disabled={!pile.canAdd}
										aria-label="One more {card.name} in {pile.label}"
										class="grid size-8 place-items-center rounded-md border border-edge text-muted
											transition-colors hover:border-neon-dim hover:text-neon disabled:opacity-30"
									>
										<svg viewBox="0 0 12 12" class="size-3.5" aria-hidden="true">
											<path
												d="M6 2.5v7M2.5 6h7"
												stroke="currentColor"
												stroke-width="1.5"
												stroke-linecap="round"
											/>
										</svg>
									</button>
								</div>
								<p class="mt-1.5 text-[0.65rem] text-muted/70">{pile.hint}</p>
							</div>
						{/each}
					</div>
				{/if}

				{#if canChoosePrinting}
					<div class="mt-4 flex min-h-0 flex-1 flex-col">
						<div class="mb-2 flex items-baseline justify-between gap-2">
							<h3 class="text-xs font-medium tracking-widest text-muted uppercase">Printing</h3>

							<div class="flex items-center gap-2">
								{#if locales.length > 1}
									<!-- Language filter. A segmented control rather than a dropdown: there are two
								     locales today, and a menu holding two items costs a click to tell you what a
								     pair of buttons says outright. -->
									<div class="flex overflow-hidden rounded border border-edge text-[0.6rem]">
										<button
											type="button"
											onclick={() => (locale = null)}
											class="px-1.5 py-0.5 transition-colors hover:text-bright"
											class:bg-raised={locale === null}
											class:text-bright={locale === null}
											class:text-muted={locale !== null}>All</button
										>
										{#each locales as code (code)}
											<button
												type="button"
												onclick={() => (locale = code)}
												class="px-1.5 py-0.5 uppercase transition-colors hover:text-bright"
												class:bg-raised={locale === code}
												class:text-bright={locale === code}
												class:text-muted={locale !== code}>{code}</button
											>
										{/each}
									</div>
								{/if}

								<button
									type="button"
									onclick={() => deck.setPrinting(card, null)}
									disabled={isDefaultPrinting(card, deck.printingIdOf(card))}
									class="text-[0.65rem] text-muted hover:text-neon disabled:opacity-40"
									>Use default</button
								>
							</div>
						</div>

						<!-- `p-1` inside the scroller, not `pr-1`: the selected tile's ring is drawn *outside*
					     its border box, so with the grid flush against an `overflow-y-auto` container the
					     ring was clipped on every edge. The padding gives it somewhere to be. -->
						<ul class="grid min-h-0 flex-1 grid-cols-5 gap-2 overflow-y-auto p-1">
							{#each visiblePrintings as option (option.id)}
								{@const active = option.id === printing.id}
								<li>
									<button
										type="button"
										onclick={() => deck.setPrinting(card, option.id)}
										aria-current={active ? 'true' : undefined}
										title="{setLabel(option.setId)} · {printTreatment(option)} · {option.locale}"
										class="relative block w-full overflow-hidden rounded transition-transform
										hover:-translate-y-0.5"
										class:ring-2={active}
										class:ring-neon={active}
									>
										<CardImage
											printingId={option.id}
											thumbhash={option.thumbhash}
											color={card.color}
											alt=""
											sizes="96px"
										/>
										<span
											class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-0.5
											bg-void/85 px-1 font-mono text-[0.5rem] text-muted tabular-nums"
										>
											<span class="truncate">{option.collectorNumber}</span>
											{#if option.locale !== 'en'}
												<span class="ml-auto uppercase">{option.locale}</span>
											{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="mt-4 flex items-center justify-between gap-2 border-t border-edge pt-3">
					{#if isLegend}
						<button
							type="button"
							onclick={removeLegend}
							class="rounded-md border border-edge px-2.5 py-1.5 text-xs text-muted transition-colors
								hover:border-card-red hover:text-card-red">Remove Legend</button
						>
					{:else}
						<button
							type="button"
							onclick={() => {
								// Both piles, since the modal shows both — "remove this card" shouldn't leave
								// three of it in the sideboard.
								for (let copy = inDeck; copy > 0; copy -= 1) deck.removeCard(card);
								for (let copy = inSideboard; copy > 0; copy -= 1) deck.removeFromSideboard(card);
								close();
							}}
							disabled={inDeck + inSideboard === 0}
							class="rounded-md border border-edge px-2.5 py-1.5 text-xs text-muted transition-colors
								hover:border-card-red hover:text-card-red disabled:opacity-40">Remove from deck</button
						>
					{/if}
					<button
						type="button"
						onclick={close}
						class="rounded-md bg-neon px-3 py-1.5 text-xs font-medium text-void hover:bg-neon-dim"
						>Done</button
					>
				</div>
			</div>
		</div>
	</div>
{/if}
