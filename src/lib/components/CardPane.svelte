<script lang="ts">
	/**
	 * The persistent detail pane — 320px, desktop only.
	 *
	 * Selecting a tile **never navigates**, so this is where reading happens while the grid stays
	 * put. It carries the card large, its stats, its rules text and the artist credit for the
	 * printing on show. What it deliberately does not carry is the printings gallery: at 320px
	 * there is no room, and that is what makes `/cards/[slug]` earn its keep rather than
	 * duplicating this.
	 */
	import { resolve } from '$app/paths';
	import { splitCardName } from '#lib/cards/derive.js';
	import { findSetIdentifier } from '#lib/cards/sets.js';
	import type { Card, Printing } from '#lib/cards/schema.js';
	import CardImage from './CardImage.svelte';
	import CardMetaBadges from './CardMetaBadges.svelte';
	import CardStats from './CardStats.svelte';
	import RulesText from './RulesText.svelte';

	let {
		card,
		printing,
		filterBarHeight
	}: { card: Card | null; printing: Printing | null; filterBarHeight: number } = $props();

	const set = $derived(printing === null ? undefined : findSetIdentifier(printing.setId));
	const nameParts = $derived(card === null ? null : splitCardName(card));
</script>

<!--
	Hidden below `lg`. The three-pane desktop layout fails badly on a phone — measured at 390px the
	header took ~350px of 844 and the fixed pane crushed the grid to a ~55px sliver. A phone needs a
	different composition, not a squeezed one, and `/cards/[slug]` is that composition.
-->
<aside
	class="sticky hidden w-80 shrink-0 overflow-y-auto border-l border-edge/60 bg-shell/40 p-4
		lg:block"
	style="top: calc(var(--spacing-nav) + {filterBarHeight}px);
		max-height: calc(100dvh - var(--spacing-nav) - {filterBarHeight}px)"
	aria-label="Selected card"
>
	{#if card === null || printing === null}
		<p class="mt-8 text-center text-sm text-balance text-muted">
			Select a card to read it here. The grid is for recognising cards; this pane is for reading
			them.
		</p>
	{:else}
		<CardImage
			printingId={printing.id}
			thumbhash={printing.thumbhash}
			color={card.color}
			alt={card.name}
			sizes="288px"
			class="rounded-lg shadow-xl shadow-black/50"
		/>

		<h2 class="mt-3 text-lg leading-tight font-semibold text-bright uppercase">{nameParts?.name}</h2>
		{#if nameParts?.subtitle}
			<p class="text-sm font-medium tracking-wide text-muted uppercase">{nameParts.subtitle}</p>
		{/if}

		<div class="mt-3">
			<CardMetaBadges {card} compact />
		</div>

		<CardStats {card} showCost={false} class="mt-3" />

		<div class="mt-3 border-t border-edge/60 pt-3">
			<RulesText paragraphs={card.rulesText} size="sm" />
			{#if card.flavorText !== null}
				<p class="mt-2 text-sm leading-relaxed text-muted italic">{card.flavorText}</p>
			{/if}
		</div>

		<!-- Per-printing artist credit, wherever a printing is shown in detail. -->
		<dl class="mt-3 space-y-1 border-t border-edge/60 pt-3 text-xs text-muted">
			<div class="flex justify-between gap-2">
				<dt>Set</dt>
				<dd class="text-right text-body">{set?.name ?? printing.setId}</dd>
			</div>
			<div class="flex justify-between gap-2">
				<dt>Printed</dt>
				<dd class="font-mono text-body">{set?.printed ?? '—'}</dd>
			</div>
			<div class="flex justify-between gap-2">
				<dt>Collector no.</dt>
				<dd class="font-mono text-body">{printing.collectorNumber}</dd>
			</div>
			<div class="flex justify-between gap-2">
				<dt>Rarity</dt>
				<dd class="text-right text-body">{printing.rarity}</dd>
			</div>
			<div class="flex justify-between gap-2">
				<dt>Artist</dt>
				<dd class="text-right text-body">{printing.artist}</dd>
			</div>
		</dl>

		<a
			href={resolve('/cards/[slug]', { slug: card.slug })}
			class="mt-4 inline-block text-sm text-neon underline decoration-dotted underline-offset-4
				transition-colors hover:text-bright"
		>
			Full card{#if card.printings.length > 1}
				· {card.printings.length} printings{/if} →
		</a>
	{/if}
</aside>
