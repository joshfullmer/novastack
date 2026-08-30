<script lang="ts">
	/**
	 * Cost, Type, and Classifications, styled after the printed card's own frame art rather than
	 * as plain stat text — see `/cards/[slug]` for the full write-up. Shared by every surface that
	 * shows a Card's metadata (the card detail page, `CardPane`, the deck view's preview panel) so
	 * a future tweak to the shapes or colors doesn't need three separate edits.
	 *
	 * `compact` only shrinks the Cost badge — the Type pennant and tag badges use a fixed pixel
	 * geometry for their 45° cuts (`badge-pennant`/`tag-cut`/`tag-cut-inset`, `layout.css`)
	 * regardless of context, so they stay identical everywhere.
	 */
	import { quoteQueryValue } from '#lib/cards/dataset.js';
	import { formatCost, type Card } from '#lib/cards/schema.js';
	import { PARAM } from '#lib/filters/state.js';
	import { COLOR_BADGE_IMAGE, COLOR_CHIP_ON, COLOR_TEXT, COLOR_TINT } from './color.js';

	let { card, compact = false }: { card: Card; compact?: boolean } = $props();
</script>

<div class="flex flex-wrap items-center {compact ? 'gap-3' : 'gap-4'}">
	<div class="relative shrink-0 {compact ? 'h-10 w-10' : 'h-16 w-16'}">
		<img src={COLOR_BADGE_IMAGE[card.color]} alt="" class="h-full w-full object-contain" />
		<span
			class="absolute inset-0 flex items-center justify-center font-mono font-bold text-bright
				tabular-nums {compact ? 'text-sm' : 'text-2xl'}"
		>
			{formatCost(card.cost)}
		</span>
	</div>

	<div class="flex flex-col gap-2">
		<span class="text-xs font-semibold tracking-[0.2em] uppercase {COLOR_TEXT[card.color]}"
			>{card.color}</span
		>
		<span
			class="inline-flex h-6 items-center pr-6 pl-4 font-mono text-sm font-bold tracking-[0.15em]
				uppercase badge-pennant {COLOR_CHIP_ON[card.color]}"
		>
			{card.cardType}
		</span>
	</div>
</div>

{#if card.classifications.length > 0}
	<ul class="mt-3 flex flex-wrap gap-x-1.5 gap-y-2">
		{#each card.classifications as classification (classification)}
			<li>
				<a
					href="/cards?{PARAM.query}={encodeURIComponent(`tag:${quoteQueryValue(classification)}`)}"
					class="group relative isolate inline-flex h-5 items-center transition-colors"
				>
					<span
						class="absolute inset-0 transition-colors tag-cut group-hover:bg-neon
							{COLOR_TINT[card.color]}"
						aria-hidden="true"
					></span>
					<span class="absolute inset-[2px] bg-void tag-cut-inset" aria-hidden="true"></span>
					<span
						class="relative z-10 pr-2.5 pl-1.5 font-mono text-xs font-bold tracking-wide
							text-bright uppercase transition-colors group-hover:text-neon"
					>
						{classification}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}
