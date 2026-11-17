<script lang="ts">
	// A deck at a glance: its cost curve, colours, how much of it is Eddiable and its rarities. Cards
	// stacked in a column, shared by a saved deck's page and the tournament deck.
	import { cn } from '#lib/cn.js';
	import { COLOR_DOT, COLOR_TINT } from '#lib/components/color.js';
	import type { DeckEntry } from '#lib/decks/legality.js';
	import { rarityTint } from '#lib/decks/rarity-tone.js';
	import {
		colorComposition,
		costCurve,
		eddiableStat,
		rarityComposition,
		type CostPick
	} from '#lib/decks/stats.js';

	// `pick` and `onpick` turn the cost curve into a filter: a bar is the cards at that cost, and the
	// page lists just those. Without `onpick` the curve is a plain chart.
	let {
		entries,
		total,
		pick = null,
		onpick
	}: {
		entries: readonly DeckEntry[];
		total: number;
		pick?: CostPick;
		onpick?: (next: CostPick) => void;
	} = $props();

	const same = (a: CostPick, cost: number | null) => a !== null && a.cost === cost;

	const curve = $derived(costCurve(entries));
	const curveMax = $derived(Math.max(1, ...curve.map((bucket) => bucket.quantity)));
	const composition = $derived(colorComposition(entries).filter((slice) => slice.quantity > 0));
	const rarityDist = $derived(rarityComposition(entries).filter((slice) => slice.quantity > 0));
	const eddiable = $derived(eddiableStat(entries));
	const eddiablePercent = $derived(
		eddiable.totalQuantity === 0 ? 0 : (eddiable.eddiableQuantity / eddiable.totalQuantity) * 100
	);
</script>

{#snippet bar(bucket: { cost: number | null; quantity: number }, chosen: boolean)}
	<span class="text-[0.65rem] text-muted tabular-nums">{bucket.quantity}</span>
	<div class="flex h-16 w-full items-end">
		<div
			class={cn('w-full rounded-sm', chosen ? 'bg-neon' : 'bg-neon-dim')}
			style="height: {(bucket.quantity / curveMax) * 100}%"
		></div>
	</div>
	<span class={cn('text-[0.65rem] tabular-nums', chosen ? 'text-bright' : 'text-muted')}
		>{bucket.cost ?? '—'}</span
	>
{/snippet}

<div class="rounded-md border border-edge bg-shell p-4">
	<p class="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Cost curve</p>
	{#if curve.length === 0}
		<p class="text-xs text-muted">No cards yet.</p>
	{:else}
		<div class="flex items-end gap-1.5">
			{#each curve as bucket (bucket.cost ?? 'null')}
				{@const chosen = same(pick, bucket.cost)}
				{#if onpick}
					<button
						type="button"
						aria-pressed={chosen}
						title="Show the {bucket.cost ?? 'no-cost'} cost cards"
						onclick={() => onpick(chosen ? null : { cost: bucket.cost })}
						class="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-sm hover:bg-raised/60"
					>
						{@render bar(bucket, chosen)}
					</button>
				{:else}
					<div class="flex flex-1 flex-col items-center gap-1">{@render bar(bucket, chosen)}</div>
				{/if}
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
				<div class={COLOR_TINT[slice.color]} style="width: {(slice.quantity / total) * 100}%"></div>
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
			{eddiable.eddiableQuantity} of {eddiable.totalQuantity} cards ({Math.round(eddiablePercent)}%)
		</p>
	{/if}
</div>

<div class="rounded-md border border-edge bg-shell p-4">
	<p class="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Rarity</p>
	{#if rarityDist.length === 0}
		<p class="text-xs text-muted">No cards yet.</p>
	{:else}
		<div class="flex h-2 overflow-hidden rounded-full bg-raised">
			{#each rarityDist as slice, index (slice.rarity)}
				<div
					class={rarityTint(index, rarityDist.length)}
					style="width: {(slice.quantity / total) * 100}%"
				></div>
			{/each}
		</div>
		<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
			{#each rarityDist as slice, index (slice.rarity)}
				<span class="inline-flex items-center gap-1.5">
					<span class="size-2 rounded-full {rarityTint(index, rarityDist.length)}"
					></span>{slice.rarity}
					{slice.quantity}
				</span>
			{/each}
		</div>
	{/if}
</div>
