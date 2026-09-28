<script lang="ts">
	/**
	 * PROTOTYPE — DELETE ME. Variant A: **inline popover thumbnail grid**.
	 *
	 * A chip showing the current printing's set + number; clicking it opens a popover anchored to
	 * the chip with every printing of that card as art. Riffs on `CardDetailOverlay`'s "Other
	 * printings" grid, so the thing you're choosing between is the thing you see.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { printTreatment } from '#lib/cards/derive.js';
	import { setLabel } from '#lib/collection/printing-search.js';
	import type { Card } from '#lib/cards/schema.js';
	import { printingPrototype as proto } from './printing-prototype.svelte.js';

	let { card }: { card: Card } = $props();

	let anchor = $state<{ left: number; top: number } | null>(null);
	const current = $derived(proto.printingFor(card));

	function toggle(event: MouseEvent & { currentTarget: HTMLElement }) {
		if (anchor) {
			anchor = null;
			return;
		}
		const rect = event.currentTarget.getBoundingClientRect();
		// Right of the chip, clamped so a row near the bottom doesn't open offscreen.
		anchor = { left: rect.right + 8, top: Math.min(rect.top, window.innerHeight - 340) };
	}
</script>

<button
	type="button"
	onclick={toggle}
	class="flex shrink-0 items-center gap-1 rounded border border-edge px-1 font-mono
		text-[0.6rem] text-muted tabular-nums transition-colors hover:border-neon-dim hover:text-neon"
	class:border-neon-dim={!proto.isDefault(card)}
	class:text-neon={!proto.isDefault(card)}
	title="Choose a printing — {setLabel(current.setId)} #{current.collectorNumber}"
>
	<span>{current.collectorNumber}</span>
	<span class="text-muted/60">▾</span>
</button>

{#if anchor}
	<!-- `fixed` + a click-catching backdrop: the row this sits in is inside an `overflow-y-auto`
	     scroller, so an absolutely-positioned popover would be clipped by it. -->
	<div class="fixed inset-0 z-40" onclick={() => (anchor = null)} role="presentation"></div>
	<div
		class="fixed z-50 w-72 rounded-lg border border-edge bg-shell p-2 shadow-2xl"
		style="left: {anchor.left}px; top: {anchor.top}px;"
	>
		<div class="mb-1.5 flex items-baseline justify-between gap-2">
			<p class="truncate text-xs font-medium text-bright">{card.name}</p>
			<button
				type="button"
				onclick={() => {
					proto.choose(card, null);
					anchor = null;
				}}
				class="shrink-0 text-[0.6rem] text-muted hover:text-neon">Default</button
			>
		</div>
		<ul class="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto">
			{#each card.printings as printing (printing.id)}
				{@const active = printing.id === current.id}
				<li>
					<button
						type="button"
						onclick={() => {
							proto.choose(card, printing.id);
							anchor = null;
						}}
						title="{setLabel(printing.setId)} · {printTreatment(printing)} · {printing.locale}"
						class="relative block w-full overflow-hidden rounded transition-transform hover:-translate-y-0.5"
						class:ring-2={active}
						class:ring-neon={active}
					>
						<CardImage
							printingId={printing.id}
							thumbhash={printing.thumbhash}
							color={card.color}
							alt=""
							sizes="64px"
						/>
						<span
							class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-0.5
								bg-void/85 px-0.5 font-mono text-[0.5rem] text-muted tabular-nums"
						>
							<span class="truncate">{printing.collectorNumber}</span>
							{#if printing.locale !== 'en'}<span class="ml-auto uppercase">{printing.locale}</span
								>{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}
