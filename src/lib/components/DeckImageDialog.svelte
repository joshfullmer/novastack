<script lang="ts">
	/**
	 * Export as an image: a tab per layout, a live preview of exactly what gets downloaded, and a
	 * Stats toggle. The composition lives in `#lib/decks/deck-image.ts` — `docs/spec/deckbuilder.md`
	 * §6. Composed only while the dialog is open, so the card art isn't fetched
	 * for a visitor who never asks for the image.
	 */
	import { composeDeckImage, type DeckImageLayout } from '#lib/decks/deck-image.js';
	import type { DeckImageOptions } from '#lib/decks/deck-image-canvas.js';

	let { ...deck }: Omit<DeckImageOptions, 'layout' | 'showStats'> = $props();

	const LAYOUTS: { id: DeckImageLayout; label: string; description: string }[] = [
		{ id: 'spread', label: 'Spread', description: 'Every card as art, grouped by type.' },
		{ id: 'list', label: 'List', description: 'The decklist — names, costs and copy counts.' }
	];

	let dialogEl = $state<HTMLDialogElement>();
	let open = $state(false);
	let layout = $state<DeckImageLayout>('spread');
	let showStats = $state(true);

	let previewUrl = $state<string | null>(null);
	let pending = $state(false);
	let failed = $state(false);
	let blob: Blob | null = null;

	// Recomposes whenever the layout, the stats toggle or the deck changes while open. The previous
	// preview stays up (dimmed) until the next one is ready, so switching tabs doesn't flash empty.
	$effect(() => {
		if (!open) return;
		const options = { ...deck, layout, showStats };
		let stale = false;
		pending = true;
		failed = false;
		composeDeckImage(options)
			.then((next) => {
				if (stale) return;
				if (!next) throw new Error('canvas unavailable');
				if (previewUrl) URL.revokeObjectURL(previewUrl);
				blob = next;
				previewUrl = URL.createObjectURL(next);
			})
			.catch(() => {
				if (!stale) failed = true;
			})
			.finally(() => {
				if (!stale) pending = false;
			});
		return () => {
			stale = true;
		};
	});

	function handleClose() {
		open = false;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		blob = null;
	}

	function download() {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${deck.deckName} ${layout}.png`;
		a.click();
		URL.revokeObjectURL(url);
	}

	const button =
		'rounded-md border border-edge px-3 py-1.5 text-sm text-body hover:border-neon hover:text-neon';
	const primary =
		'rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void hover:bg-neon-dim disabled:opacity-50';
</script>

<button
	type="button"
	onclick={() => {
		open = true;
		dialogEl?.showModal();
	}}
	class={button}>Deck image</button
>
<dialog
	bind:this={dialogEl}
	onclose={handleClose}
	aria-label="Deck image"
	class="w-full max-w-[84rem] rounded-lg border border-edge bg-shell p-4"
>
	<div class="flex items-end justify-between gap-4 border-b border-edge">
		<div role="tablist" class="flex gap-1">
			{#each LAYOUTS as option (option.id)}
				<button
					type="button"
					role="tab"
					aria-selected={layout === option.id}
					onclick={() => (layout = option.id)}
					class="-mb-px border-b-2 px-3 py-1.5 text-sm {layout === option.id
						? 'border-neon text-neon'
						: 'border-transparent text-body hover:text-neon'}">{option.label}</button
				>
			{/each}
		</div>
		<label class="flex items-center gap-2 pb-1.5 text-sm text-body">
			<input type="checkbox" bind:checked={showStats} class="accent-neon" />
			Stats
		</label>
	</div>
	<p class="mt-3 text-sm text-muted">
		{LAYOUTS.find((option) => option.id === layout)?.description}
	</p>

	<div class="mt-2 min-h-40">
		{#if failed}
			<p class="text-sm text-muted">Couldn’t compose the image.</p>
		{:else if previewUrl}
			<img
				src={previewUrl}
				alt="{deck.deckName} deck image"
				class="mx-auto max-h-[calc(100dvh-15rem)] w-auto max-w-full rounded-md transition-opacity
					{pending ? 'opacity-50' : ''}"
			/>
			<p class="mt-2 text-xs text-muted">Right-click the image to copy it, or download it below.</p>
		{:else}
			<p class="text-sm text-muted">Composing…</p>
		{/if}
	</div>

	<div class="mt-4 flex justify-end gap-2">
		<button type="button" onclick={() => dialogEl?.close()} class={button}>Close</button>
		<button type="button" onclick={download} disabled={!previewUrl || pending} class={primary}>
			Download image
		</button>
	</div>
</dialog>
