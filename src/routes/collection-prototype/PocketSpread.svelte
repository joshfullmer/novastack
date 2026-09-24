<script lang="ts">
	/**
	 * PROTOTYPE — throwaway. One Binder Page: nine Pockets, each holding at most one Printing and
	 * no quantity. An empty Pocket is a held space, not a missing row — so it renders as a real
	 * dashed slot you can click, not as absence.
	 *
	 * Shared by variants B and C, which disagree about how prominent a Binder is but agree on what
	 * a Page looks like.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { clearPocket, slotByPrintingId, type Binder } from './fake-collection.svelte.js';

	let {
		binder,
		page,
		selected = null,
		onSelect,
		size = 'md'
	}: {
		binder: Binder;
		page: number;
		selected?: number | null;
		onSelect: (pocket: number) => void;
		size?: 'sm' | 'md';
	} = $props();

	const pockets = $derived(binder.pages[page] ?? []);
</script>

<div
	class="rounded-xl border-2 border-edge bg-shell p-3 shadow-[inset_0_0_40px_rgba(0,0,0,0.55)]
		sm:p-5"
>
	<div class="grid grid-cols-3 {size === 'sm' ? 'gap-2' : 'gap-3 sm:gap-4'}">
		{#each pockets as printingId, pocket (pocket)}
			{@const slot = printingId ? slotByPrintingId.get(printingId) : null}
			<div class="relative">
				<button
					onclick={() => onSelect(pocket)}
					class="block card-frame w-full overflow-hidden rounded-lg border-2 transition-colors
						{selected === pocket
						? 'border-neon'
						: slot
							? 'border-edge/50'
							: 'border-dashed border-edge/70 hover:border-neon-dim'}"
					aria-label={slot ? slot.card.name : `Empty pocket ${pocket + 1}`}
				>
					{#if slot}
						<CardImage
							printingId={slot.printing.id}
							thumbhash={slot.printing.thumbhash}
							color={slot.card.color}
							alt={slot.card.name}
							sizes={size === 'sm' ? '150px' : '240px'}
						/>
					{:else}
						<span class="absolute inset-0 grid place-items-center font-mono text-xs text-muted/40"
							>empty</span
						>
					{/if}
				</button>

				{#if slot}
					<button
						onclick={() => clearPocket(binder, page, pocket)}
						class="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded bg-void/85
							text-xs text-muted hover:text-bright"
						aria-label="Empty this pocket">×</button
					>
					<span
						class="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-void/85 px-1.5
							py-0.5 font-mono text-[0.6rem] text-muted">{slot.printing.collectorNumber}</span
					>
				{/if}
			</div>
		{/each}
	</div>
</div>
