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
	import CardImage from '#lib/components/CardImage.svelte';
	import {
		COLOR_BADGE_SHAPE,
		COLOR_BADGE_SIZE,
		COLOR_DOT,
		COLOR_TEXT,
		COLOR_TINT
	} from '#lib/components/color.js';
	import { dataset } from '#lib/cards/index.js';
	import type { Card } from '#lib/cards/schema.js';
	import { COLORS } from '#lib/cards/vocabulary.js';
	import { LEGEND_SLOTS, MAX_DECK_SIZE, MIN_DECK_SIZE } from '#lib/decks/legality.js';
	import { createDeckState } from '#lib/decks/deck-state.svelte.js';
	import { groupDeckEntries } from '#lib/decks/grouping.js';
	import { colorComposition, costCurve, eddiableStat } from '#lib/decks/stats.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';

	const legendSlots = Array.from({ length: LEGEND_SLOTS }, (_, index) => index);

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const deck = createDeckState(data.payload);

	let deckView = $state<'list' | 'gallery'>('list');

	// The preview panel always shows *something* — defaults to the first Legend, or the first
	// Main Deck entry if there's no Legend yet, rather than sitting empty until a hover happens.
	const fallback = $derived(deck.legends[0] ?? deck.entries[0]?.card ?? null);
	let focused = $state<Card | null>(null);
	const shown = $derived(focused ?? fallback);

	const mainGroups = $derived(groupDeckEntries(dataset, deck.entries));
	const sizeTone = $derived(SIZE_STATUS_TONE[deck.sizeStatus]);

	const curve = $derived(costCurve(deck.entries));
	const curveMax = $derived(Math.max(1, ...curve.map((bucket) => bucket.quantity)));
	const composition = $derived(
		colorComposition(deck.entries).filter((slice) => slice.quantity > 0)
	);
	const eddiable = $derived(eddiableStat(deck.entries));
	const eddiablePercent = $derived(
		eddiable.totalQuantity === 0 ? 0 : (eddiable.eddiableQuantity / eddiable.totalQuantity) * 100
	);
</script>

<svelte:head>
	<title>{data.deckName} — novastack</title>
</svelte:head>

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
			<!-- Preview panel -->
			<div class="lg:sticky lg:top-6 lg:self-start">
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
					<p class="mt-2 text-sm font-medium {COLOR_TEXT[shown.color]}">{shown.name}</p>
					<p class="text-xs text-muted">
						{shown.cardType}
						{#if shown.cost !== null}· Cost {shown.cost}{/if}
						{#if shown.power !== null}· Power {shown.power}{/if}
						{#if shown.ramRequired !== null}· RAM {shown.ramRequired}{/if}
					</p>
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
				<div class="mb-4 flex items-center justify-between gap-4">
					<div class="min-w-0">
						<h1 class="truncate text-xl font-semibold text-bright">{data.deckName}</h1>
						<p class="text-xs text-muted">
							by {data.ownerName} · <span class="capitalize">{data.visibility}</span>
						</p>
					</div>
					{#if data.isOwner}
						<a
							href="/decks/{data.deckId}/edit"
							class="shrink-0 rounded-md bg-neon px-3 py-1.5 text-sm
							font-medium text-void hover:bg-neon-dim">Edit deck</a
						>
					{/if}
				</div>

				<div class="mb-4 flex items-center gap-4">
					<div class="flex items-center gap-3">
						{#each legendSlots as slot (slot)}
							{@const legend = deck.legends[slot]}
							{#if legend}
								<a
									href={resolve('/cards/[slug]', { slug: legend.slug })}
									class="card-frame w-24 shrink-0 overflow-hidden rounded-md border border-edge"
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
									class="flex card-frame w-24 shrink-0 items-center justify-center rounded-md
									border border-edge bg-surface text-muted"
								>
									—
								</div>
							{/if}
						{/each}
					</div>
					<!-- RAM budget in each Color's own cost-badge shape from the physical card — dark
					     fill, colored outline, the number inside — instead of a generic pill. A real
					     SVG `<polygon>`, not a `clip-path` div: `stroke` gives a correctly-mitered
					     continuous outline at every vertex for free, which a clipped border can't. -->
					<div class="flex flex-wrap gap-3">
						{#each COLORS as color (color)}
							{@const ram = deck.budget[color]}
							{#if ram > 0}
								<div class="flex flex-col items-center gap-1">
									<div class="relative {COLOR_BADGE_SIZE[color]}">
										<svg
											viewBox={COLOR_BADGE_SHAPE[color].viewBox}
											class="absolute inset-0 size-full {COLOR_TEXT[color]}"
										>
											<polygon
												points={COLOR_BADGE_SHAPE[color].points}
												class="fill-void stroke-current"
												stroke-width="5"
											/>
										</svg>
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

				{#if !deck.isRamLegal}
					<div class="mb-4 rounded-md border border-edge bg-card-red/10 p-3 text-sm text-card-red">
						{deck.ramViolations.length}
						{deck.ramViolations.length === 1 ? 'card exceeds' : 'cards exceed'}
						this deck's Legends' RAM: {deck.ramViolations
							.map((entry) => entry.card.name)
							.join(', ')}
					</div>
				{/if}

				<div class="mb-3 flex items-center justify-between">
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
								onclick={() => (deckView = 'list')}
								class="px-2 py-1"
								class:bg-raised={deckView === 'list'}
								class:text-bright={deckView === 'list'}
								class:text-muted={deckView !== 'list'}>List</button
							>
							<button
								type="button"
								onclick={() => (deckView = 'gallery')}
								class="px-2 py-1"
								class:bg-raised={deckView === 'gallery'}
								class:text-bright={deckView === 'gallery'}
								class:text-muted={deckView !== 'gallery'}>Gallery</button
							>
						</div>
					</div>
				</div>

				{#if deckView === 'list'}
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
								class="border-b border-edge/50 bg-shell px-4 py-1 text-xs font-medium
								tracking-wide text-muted uppercase"
							>
								{group.label} ({group.quantity})
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
								class="mt-3 mb-1 text-xs font-medium tracking-wide text-muted uppercase
								first:mt-0"
							>
								{group.label} <span class="text-muted/70 tabular-nums">{group.quantity}</span>
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
			</div>
		</div>
	</div>
</div>
