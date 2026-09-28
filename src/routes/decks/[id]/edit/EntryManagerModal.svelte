<script lang="ts">
	/**
	 * PROTOTYPE — DELETE ME. Variants **D** and **F**: clicking a deck entry opens a manager for
	 * that card.
	 *
	 * Round 1's lesson was that a 360px rail can't host per-entry controls at any size worth
	 * clicking. This stops trying: the row becomes a *target*, and everything you might do to an
	 * entry — copies, sideboard, printing, removal — happens in one surface big enough to show the
	 * art you're choosing between.
	 *
	 * It also removes a destructive default. Today a single click on a Gallery tile takes a copy
	 * out of the deck, with no confirmation and no undo; here a click opens this, and removal is a
	 * labelled button.
	 *
	 * Copies mutate the **real** deck state (local until "Save deck"); only the printing choice is
	 * stubbed. Mounted once at page level, driven by `proto.managing`.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { printTreatment } from '#lib/cards/derive.js';
	import { setLabel } from '#lib/collection/printing-search.js';
	import { cardBySlug, type DeckState } from '#lib/decks/deck-state.svelte.js';
	import { MAX_COPIES, SIDEBOARD_SIZE } from '#lib/decks/legality.js';
	import { printingPrototype as proto } from './printing-prototype.svelte.js';

	let { deck }: { deck: DeckState } = $props();

	const card = $derived(proto.managing ? cardBySlug(proto.managing) : undefined);
	const printing = $derived(card ? proto.printingFor(card) : null);
	const inDeck = $derived(card ? deck.quantityOf(card) : 0);
	const inSideboard = $derived(card ? deck.sideboardQuantityOf(card) : 0);

	function close() {
		proto.manage(null);
	}
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && close()} />

{#if card && printing}
	<!-- A plain fixed backdrop rather than `<dialog>`/`showModal`, deliberately: this is throwaway
	     code being judged on layout and reach, and the real version should copy
	     `CardDetailOverlay`'s dialog + view-transition handling rather than this. -->
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
					<h2 class="min-w-0 truncate text-lg font-semibold text-bright">{card.name}</h2>
					<button
						type="button"
						onclick={close}
						aria-label="Close"
						class="shrink-0 text-muted hover:text-bright">✕</button
					>
				</div>

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
									class="size-8 rounded-md border border-edge text-lg text-muted transition-colors
										hover:border-card-red hover:text-card-red disabled:opacity-30">−</button
								>
								<span class="min-w-6 text-center text-xl font-semibold text-bright tabular-nums"
									>{pile.count}</span
								>
								<button
									type="button"
									onclick={pile.add}
									disabled={!pile.canAdd}
									aria-label="One more {card.name} in {pile.label}"
									class="size-8 rounded-md border border-edge text-lg text-muted transition-colors
										hover:border-neon-dim hover:text-neon disabled:opacity-30">+</button
								>
							</div>
							<p class="mt-1.5 text-[0.65rem] text-muted/70">{pile.hint}</p>
						</div>
					{/each}
				</div>

				<div class="mt-4 flex min-h-0 flex-1 flex-col">
					<div class="mb-2 flex items-baseline justify-between gap-2">
						<h3 class="text-xs font-medium tracking-widest text-muted uppercase">Printing</h3>
						<button
							type="button"
							onclick={() => proto.choose(card, null)}
							disabled={proto.isDefault(card)}
							class="text-[0.65rem] text-muted hover:text-neon disabled:opacity-40"
							>Use default</button
						>
					</div>
					<ul class="grid min-h-0 flex-1 grid-cols-5 gap-2 overflow-y-auto pr-1">
						{#each card.printings as option (option.id)}
							{@const active = option.id === printing.id}
							<li>
								<button
									type="button"
									onclick={() => proto.choose(card, option.id)}
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

				<div class="mt-4 flex items-center justify-between gap-2 border-t border-edge pt-3">
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
