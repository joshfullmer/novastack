<script lang="ts">
	/**
	 * PROTOTYPE — DELETE ME. Variant B's docked pane — mounted once at page level.
	 *
	 * Sits against the deck panel's left edge (the deck panel is 360px, fixed right), so it never
	 * covers the deck it's editing — the thing a popover unavoidably does. Rows rather than a grid:
	 * a row has space for the set name, treatment and locale spelled out, which a 64px thumbnail
	 * caption does not.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { printTreatment } from '#lib/cards/derive.js';
	import { setLabel } from '#lib/collection/printing-search.js';
	import { cardBySlug } from '#lib/decks/deck-state.svelte.js';
	import { printingPrototype as proto } from './printing-prototype.svelte.js';

	const card = $derived(proto.selectedSlug ? cardBySlug(proto.selectedSlug) : undefined);
	const current = $derived(card ? proto.printingFor(card) : null);
</script>

{#if card && current}
	<aside
		class="fixed right-[360px] bottom-0 z-40 hidden w-80 flex-col border-x border-t border-edge
			bg-shell shadow-2xl lg:flex"
		style="top: var(--spacing-nav);"
	>
		<div class="flex items-baseline justify-between gap-2 border-b border-edge px-3 py-2">
			<p class="min-w-0 truncate text-sm font-medium text-bright">{card.name}</p>
			<button
				type="button"
				onclick={() => proto.select(null)}
				aria-label="Close printing pane"
				class="shrink-0 text-muted hover:text-bright">✕</button
			>
		</div>

		<button
			type="button"
			onclick={() => proto.choose(card, null)}
			class="border-b border-edge px-3 py-1.5 text-left text-[0.65rem] text-muted hover:text-neon"
		>
			{proto.isDefault(card) ? 'Using the default printing' : 'Reset to default printing'}
		</button>

		<ul class="min-h-0 flex-1 overflow-y-auto">
			{#each card.printings as printing (printing.id)}
				{@const active = printing.id === current.id}
				<li>
					<button
						type="button"
						onclick={() => proto.choose(card, printing.id)}
						class="flex w-full items-center gap-2.5 border-b border-edge/50 px-3 py-2 text-left
							transition-colors hover:bg-raised/60"
						class:bg-raised={active}
					>
						<span
							class="w-12 shrink-0 overflow-hidden rounded"
							class:ring-2={active}
							class:ring-neon={active}
						>
							<CardImage
								printingId={printing.id}
								thumbhash={printing.thumbhash}
								color={card.color}
								alt=""
								sizes="48px"
							/>
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-xs {active ? 'text-neon' : 'text-body'}">
								{setLabel(printing.setId)}
							</span>
							<span class="block font-mono text-[0.6rem] text-muted tabular-nums">
								#{printing.collectorNumber} · {printTreatment(printing)}{printing.locale !== 'en'
									? ` · ${printing.locale.toUpperCase()}`
									: ''}
							</span>
						</span>
						{#if active}<span class="shrink-0 text-xs text-neon">◈</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	</aside>
{/if}
