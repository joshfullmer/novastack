<script lang="ts">
	/**
	 * Paste a decklist, see what it resolves to, then replace the draft with it.
	 *
	 * Parses client-side against the card data the editor already holds, so there is no server
	 * round trip and no new write path: **Replace draft** only changes the local `deck` state, and
	 * "Save deck" is still the one thing that persists anything. "Discard changes" undoes it.
	 *
	 * The preview is live rather than behind a button. Parsing 151 cards is free, and it is what
	 * makes a suggestion cheap to accept: picking one rewrites that line in the textarea, which
	 * re-parses, so there is no second piece of state saying "this line was fixed" to keep in step
	 * with the text. The text stays the single source of truth.
	 */
	import { dataset } from '#lib/cards/index.js';
	import type { Card } from '#lib/cards/schema.js';
	import type { DeckState } from '#lib/decks/deck-state.svelte.js';
	import { importDeck, type UnresolvedLine } from '#lib/decks/import.js';
	import { LEGEND_SLOTS, SIDEBOARD_SIZE } from '#lib/decks/legality.js';

	let { deck, onapply }: { deck: DeckState; onapply?: () => void } = $props();

	const placeholder =
		'// Legends\n1 V - Streetkid\n\n// Main Deck\n3 Chrome Fang\n\n// Sideboard\n1 Kiroshi Optics';

	let dialogEl: HTMLDialogElement;
	let text = $state('');

	const result = $derived(importDeck(text, dataset.cards));
	const mainCards = $derived(result.entries.reduce((sum, entry) => sum + entry.quantity, 0));
	const sideboardCards = $derived(result.sideboard.reduce((sum, entry) => sum + entry.quantity, 0));
	const hasCards = $derived(
		result.legends.length > 0 || result.entries.length > 0 || result.sideboard.length > 0
	);

	export function show() {
		dialogEl.showModal();
	}

	/** Rewrites one line to the card the user picked, keeping its place under its header. */
	function accept(line: UnresolvedLine, card: Card) {
		const lines = text.split(/\r?\n/);
		lines[line.line - 1] = `${line.quantity ?? 1} ${card.name}`;
		text = lines.join('\n');
	}

	function apply() {
		deck.replaceWith({
			legends: result.legends,
			entries: result.entries,
			sideboard: result.sideboard
		});
		text = '';
		dialogEl.close();
		onapply?.();
	}
</script>

<dialog
	bind:this={dialogEl}
	aria-label="Import a decklist"
	class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-edge bg-shell p-4
		text-body"
>
	<h2 class="text-sm font-medium text-bright">Import a decklist</h2>
	<p class="mt-1 text-xs text-muted">
		Paste a list from the sim, the official deck builder or Melee. It replaces this draft — nothing
		is saved until you press Save deck, and Discard changes undoes it.
	</p>

	<textarea
		bind:value={text}
		aria-label="Decklist"
		spellcheck="false"
		{placeholder}
		class="mt-3 h-56 w-full resize-y rounded-md border border-edge bg-void p-2 font-mono text-xs
			text-body placeholder:text-muted/60"></textarea>

	{#if text.trim() !== ''}
		<div class="mt-3 space-y-3 text-sm" aria-live="polite">
			<p class="text-muted tabular-nums">
				<span class="text-bright">{result.legends.length}/{LEGEND_SLOTS}</span> Legends ·
				<span class="text-bright">{mainCards}</span> main deck ·
				<span class="text-bright">{sideboardCards}/{SIDEBOARD_SIZE}</span> sideboard
			</p>

			{#if result.warnings.length > 0}
				<ul class="space-y-1 text-xs text-card-yellow" aria-label="Adjustments">
					{#each result.warnings as warning (warning.message)}
						<li>{warning.message}</li>
					{/each}
				</ul>
			{/if}

			{#if result.unresolved.length > 0}
				<div>
					<p class="text-xs font-medium text-card-red">
						{result.unresolved.length}
						{result.unresolved.length === 1 ? 'line' : 'lines'} not understood — left out
					</p>
					<ul class="mt-1 space-y-1.5" aria-label="Unresolved lines">
						{#each result.unresolved as line (line.line)}
							<li class="rounded-md border border-edge bg-void px-2 py-1.5 text-xs">
								<span class="text-muted tabular-nums">Line {line.line}</span>
								<span class="ml-1 font-mono text-body">{line.text}</span>
								{#if line.suggestions.length > 0}
									<span class="ml-1 text-muted">Did you mean</span>
									{#each line.suggestions as card (card.slug)}
										<button
											type="button"
											onclick={() => accept(line, card)}
											class="ml-1 rounded border border-edge px-1.5 py-0.5 text-body
												hover:border-neon hover:text-neon">{card.name}</button
										>
									{/each}
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}

	<div class="mt-4 flex justify-end gap-2">
		<button
			type="button"
			onclick={() => dialogEl.close()}
			class="rounded-md border border-edge px-3 py-1.5 text-sm text-body hover:border-neon
				hover:text-neon">Cancel</button
		>
		<button
			type="button"
			onclick={apply}
			disabled={!hasCards}
			class="rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void hover:bg-neon-dim
				disabled:opacity-40">Replace draft</button
		>
	</div>
</dialog>
