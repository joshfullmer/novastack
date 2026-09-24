<script lang="ts">
	/**
	 * A Printing, opened from the card you clicked — the zoom-in detail overlay.
	 *
	 * **The card flies from the tile and back to it.** That is the whole idea: the overlay is the
	 * tile, bigger, not a dialog that happened to appear over it. Measured off cyberdecktools, which
	 * does this better than anyone else in the space
	 * (`docs/research/collection-recon/cyberdecktools-card-detail.md`) — but by a composited
	 * `transform` rather than their animated `width`/`height`/`left`/`top`, which is layout on every
	 * frame for the same movement.
	 *
	 * Three clocks, deliberately: the scrim lands first (240ms), the panel next (320ms), the card
	 * last (360ms, decelerating). The card still moving after everything else has settled is what
	 * makes it read as the card opening.
	 *
	 * A native `<dialog>`, so Esc, the backdrop, focus containment and the top layer are the
	 * platform's job rather than ours. Scroll locking is not — `<dialog>` stops you *interacting*
	 * with the page behind, not scrolling it — so that's the one thing done by hand.
	 */
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { printTreatment, splitCardName } from '#lib/cards/derive.js';
	import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';
	import { printingRow, setLabel } from '#lib/collection/printing-search.js';
	import CardImage from '#lib/components/CardImage.svelte';
	import QuantityStepper from '#lib/components/QuantityStepper.svelte';
	import RulesText from '#lib/components/RulesText.svelte';

	let {
		/** The Printing to show, or `null` for closed. Changing it swaps the card without reopening. */
		printingId = null,
		/** Copies held, per Printing id — the caller already has the Collection. */
		ownedOf,
		/** Whether this Printing is on the default Wantlist, and how to put it there. */
		wanted = false,
		wantlistName = null,
		onWant,
		onClose,
		onShowPrinting
	}: {
		printingId?: string | null;
		ownedOf: (printingId: string) => number;
		wanted?: boolean;
		wantlistName?: string | null;
		onWant?: (printingId: string) => void;
		onClose: () => void;
		onShowPrinting: (printingId: string) => void;
	} = $props();

	/** Matches the card's own animation; the scrim and panel run shorter, in `layout.css`. */
	const ZOOM_MS = 360;
	const ZOOM_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

	let dialog = $state<HTMLDialogElement>();
	let heroEl = $state<HTMLElement>();

	/** Open and close are driven by `printingId` rather than called, so the URL can own the state. */
	let shown = $state<string | null>(null);

	/**
	 * Which Printing is on screen, derived from `shown` — **not** from the `printingId` prop.
	 *
	 * This is what keeps the closing animation alive. The prop goes null the moment the URL clears,
	 * and a template condition reading it tore the dialog out of the DOM on that same tick: the
	 * exit flight never ran and the scroll lock never lifted. `shown` is ours, and it survives
	 * until the card has finished flying home.
	 */
	const row = $derived(shown ? printingRow(shown) : undefined);
	const nameParts = $derived(row ? splitCardName(row.card) : null);
	/** Every printing of the same Card, this one included — switching is the point. */
	const siblings = $derived(row ? row.card.printings : []);

	function reduceMotion(): boolean {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	/**
	 * The tile this Printing is shown in, if it's on screen.
	 *
	 * Found by attribute rather than passed in as a rect, and re-found on close: between opening and
	 * closing the grid may have scrolled, or the tile may have been filtered away entirely. A rect
	 * captured at click time would fly the card back to where the tile *was*.
	 */
	function tileFor(id: string): HTMLElement | null {
		return document.querySelector<HTMLElement>(`[data-printing-tile="${id}"]`);
	}

	/**
	 * Animates the hero between a tile's rect and its own.
	 *
	 * Scale from width alone: card art is a fixed 733:1024 everywhere, so one factor covers both
	 * axes and an aspect mismatch can't creep in. Centres rather than corners, because the transform
	 * scales about the centre.
	 */
	function flip(tile: HTMLElement, direction: 'in' | 'out'): Animation | null {
		if (!heroEl) return null;

		const from = tile.getBoundingClientRect();
		const to = heroEl.getBoundingClientRect();
		if (to.width === 0) return null;

		const scale = from.width / to.width;
		const shiftX = from.left + from.width / 2 - (to.left + to.width / 2);
		const shiftY = from.top + from.height / 2 - (to.top + to.height / 2);
		const tileFrame = `translate(${shiftX}px, ${shiftY}px) scale(${scale})`;

		const frames = [{ transform: tileFrame }, { transform: 'translate(0, 0) scale(1)' }];

		return heroEl.animate(direction === 'in' ? frames : frames.toReversed(), {
			duration: ZOOM_MS,
			easing: ZOOM_EASE,
			fill: 'forwards'
		});
	}

	$effect(() => {
		if (printingId === shown) return;

		if (printingId === null) void hide();
		else if (shown === null) void show(printingId);
		else shown = printingId; // A swap between printings: no dialog work, just new content.
	});

	async function show(id: string) {
		shown = id;
		await tick();
		if (!dialog?.isConnected) return;

		dialog.showModal();
		// `<dialog>` blocks interaction with the page behind it but not scrolling it.
		document.documentElement.style.overflow = 'hidden';

		const tile = tileFor(id);
		if (tile && !reduceMotion()) flip(tile, 'in');
	}

	async function hide() {
		const id = shown;
		if (id === null) return;

		const tile = tileFor(id);
		const animation = tile && !reduceMotion() ? flip(tile, 'out') : null;
		await animation?.finished.catch(() => undefined);

		// `dialog` may already be gone if something unmounted us mid-flight; the lock and the state
		// still have to be put back either way, which is why neither is inside a guard.
		dialog?.close();
		document.documentElement.style.overflow = '';
		shown = null;
	}

	// A close that starts in the platform — Esc, or the backdrop — still has to tell the caller,
	// which owns the URL. Without this the dialog would shut while `?card=` stayed put.
	function requestClose() {
		onClose();
	}

	// Guarded on `browser`: Svelte runs `onDestroy` once the server render finishes too, where
	// `document` doesn't exist — the same trap the drag engine's teardown fell into.
	onDestroy(() => {
		if (browser) document.documentElement.style.overflow = '';
	});
</script>

{#if shown && row}
	{@const owned = ownedOf(row.printing.id)}
	<!--
		`onclose` covers Esc and anything else the platform closes for; `onclick` on the dialog
		itself is the backdrop, since the backdrop is not a child and clicks on it land here while
		clicks inside land on the stage.
	-->
	<dialog
		bind:this={dialog}
		oncancel={(event) => {
			// Esc arrives as `cancel` *before* `close`, so cancelling it here is what lets the card fly
			// back to its tile instead of the dialog vanishing on the spot. `requestClose` tells the
			// caller, which clears the URL, which brings us back through `hide()`.
			event.preventDefault();
			requestClose();
		}}
		onclose={() => {
			// Defensive: whatever closed the dialog — including something we didn't route through
			// `hide()` — our state and the scroll lock have to agree with reality.
			shown = null;
			if (browser) document.documentElement.style.overflow = '';
		}}
		onclick={(event) => {
			if (event.target === dialog) requestClose();
		}}
		aria-label="{row.card.name} — card details"
		class="m-auto max-h-[92vh] w-[min(64rem,94vw)] overflow-visible bg-transparent p-0
			backdrop:animate-[scrim-in_240ms_linear] backdrop:bg-void/80
			backdrop:backdrop-blur-sm motion-reduce:backdrop:animate-none"
	>
		<div
			class="flex max-h-[92vh] animate-[detail-panel-in_320ms_ease-out] flex-col gap-4
				overflow-y-auto p-1 motion-reduce:animate-none sm:flex-row sm:gap-6 sm:overflow-visible"
		>
			<!-- The card, and the two things you do to a card: own it, or want it. -->
			<div class="flex shrink-0 flex-col gap-3 sm:w-72">
				<!-- `will-change` while it flies; the FLIP scales this element, so nothing inside it
				     may be positioned relative to the viewport. -->
				<div bind:this={heroEl} class="will-change-transform">
					<CardImage
						printingId={row.printing.id}
						thumbhash={row.printing.thumbhash}
						color={row.card.color}
						alt={row.card.name}
						sizes="(min-width: 640px) 288px, 90vw"
						eager
						class="rounded-2xl shadow-2xl shadow-void"
					/>
				</div>

				<div class="rounded-xl border border-edge bg-shell p-3">
					<p class="mb-2 text-xs text-muted tabular-nums">
						{owned}
						{owned === 1 ? 'copy' : 'copies'} in your collection
					</p>

					<!-- The same stepper as the grid, not a second kind. It reads the store directly, so
					     the count here and the count on the tile behind cannot disagree. -->
					<div class="flex items-center gap-3">
						<QuantityStepper printingId={row.printing.id} label={row.card.name} expanded />

						{#if onWant && wantlistName}
							<button
								type="button"
								onclick={() => onWant?.(row.printing.id)}
								disabled={wanted}
								class="flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors {wanted
									? 'border-neon/60 text-neon'
									: 'border-edge text-muted hover:border-neon-dim hover:text-neon'}"
								>{wanted ? `On ${wantlistName}` : `Add to ${wantlistName}`}</button
							>
						{/if}
					</div>
				</div>
			</div>

			<!-- Everything the card says, and every other way it was printed. -->
			<div
				class="min-w-0 flex-1 rounded-xl border border-edge bg-shell p-4 sm:max-h-[92vh]
					sm:overflow-y-auto"
			>
				<div class="mb-3 flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<h2 class="text-2xl font-bold tracking-tight text-bright">{nameParts?.name}</h2>
						{#if nameParts?.subtitle}
							<p class="text-sm text-muted">{nameParts.subtitle}</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={requestClose}
						aria-label="Close card details"
						class="grid size-8 shrink-0 place-items-center rounded-md border border-edge text-muted
							transition-colors hover:border-neon-dim hover:text-neon">×</button
					>
				</div>

				<p class="font-mono text-xs text-neon-dim">
					{setLabel(row.printing.setId)} · {printTreatment(row.printing) === 'beta'
						? 'Beta'
						: 'Retail'} · #{row.printing.collectorNumber}{row.printing.locale !== DEFAULT_LOCALE
						? ` · ${row.printing.locale.toUpperCase()}`
						: ''}
				</p>
				<p class="mt-1 text-xs text-muted">
					{row.printing.rarity}{row.printing.artist ? ` · Art by ${row.printing.artist}` : ''}
				</p>

				{#if row.card.rulesText.length > 0}
					<div class="mt-3 border-t border-edge pt-3">
						<RulesText paragraphs={row.card.rulesText} size="sm" />
					</div>
				{/if}

				{#if siblings.length > 1}
					<div class="mt-4 border-t border-edge pt-3">
						<h3 class="mb-2 text-xs font-medium tracking-widest text-muted uppercase">
							Other printings
						</h3>
						<ul class="grid grid-cols-4 gap-2 sm:grid-cols-5">
							{#each siblings as printing (printing.id)}
								{@const count = ownedOf(printing.id)}
								{@const current = printing.id === row.printing.id}
								<li>
									<button
										type="button"
										onclick={() => onShowPrinting(printing.id)}
										aria-current={current ? 'true' : undefined}
										title="{setLabel(printing.setId)} #{printing.collectorNumber}"
										class="relative block w-full rounded-lg transition-transform
											hover:-translate-y-0.5 {current ? 'ring-2 ring-neon' : ''} {count === 0 ? 'card-veil' : ''}"
									>
										<CardImage
											printingId={printing.id}
											thumbhash={printing.thumbhash}
											color={row.card.color}
											alt=""
											sizes="90px"
											class="rounded-lg"
										/>
										<span
											class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1
												rounded-b-lg bg-void/85 px-1 py-0.5 font-mono text-[0.55rem] text-muted
												tabular-nums"
										>
											<span class="truncate">{printing.collectorNumber}</span>
											{#if count > 0}<span class="ml-auto text-neon-dim">×{count}</span>{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<a
					href={resolve('/cards/[slug]', { slug: row.card.slug })}
					class="mt-4 inline-block text-xs text-muted transition-colors hover:text-neon"
					>Full card page ›</a
				>
			</div>
		</div>
	</dialog>
{/if}
