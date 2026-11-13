<script lang="ts">
	/**
	 * Write a deck's Guide (`CONTEXT.md`) — Markdown, with a Preview tab that renders exactly what the
	 * public page will, through the same `renderGuide`.
	 *
	 * Edits the editor's local `guide` draft and nothing else: like Import's "Replace draft", it
	 * writes nothing to the server. The Guide persists with the editor's Save, and "Discard changes"
	 * undoes it. Typing lands in the draft live, so closing the dialog any way at all (Done, Esc, a
	 * click outside) loses nothing.
	 */
	import { GUIDE_MAX_LENGTH } from '#lib/decks/guide.js';
	import GuideBody from './GuideBody.svelte';

	let { guide = $bindable('') }: { guide?: string } = $props();

	const placeholder =
		'## Mulligan\n\nKeep hands with two units that cost 3 or less.\n\n## Matchups\n\n- **Versus Arasaka:** …';

	let dialogEl: HTMLDialogElement;
	let mode = $state<'write' | 'preview'>('write');

	export function show() {
		mode = 'write';
		dialogEl.showModal();
	}

	const remaining = $derived(GUIDE_MAX_LENGTH - guide.length);
</script>

<dialog
	bind:this={dialogEl}
	aria-label="Deck guide"
	class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-edge bg-shell p-4
		text-body"
>
	<h2 class="text-sm font-medium text-bright">Deck guide</h2>
	<p class="mt-1 text-xs text-muted">
		How to play this deck — matchups, mulligans, sideboarding. Markdown. Shown on the deck's page
		under its Legends. Saved with Save deck; Discard changes undoes it.
	</p>

	<div class="mt-3 flex items-center gap-4 border-b border-edge text-sm" role="tablist">
		{#each ['write', 'preview'] as const as tab (tab)}
			<button
				type="button"
				role="tab"
				aria-selected={mode === tab}
				onclick={() => (mode = tab)}
				class="-mb-px border-b-2 px-1 pb-2 capitalize"
				class:border-neon={mode === tab}
				class:text-neon={mode === tab}
				class:border-transparent={mode !== tab}
				class:text-muted={mode !== tab}>{tab}</button
			>
		{/each}
	</div>

	{#if mode === 'write'}
		<textarea
			bind:value={guide}
			maxlength={GUIDE_MAX_LENGTH}
			aria-label="Guide, in Markdown"
			spellcheck="true"
			{placeholder}
			class="mt-3 h-72 w-full resize-y rounded-md border border-edge bg-void p-2 font-mono text-xs
				text-body placeholder:text-muted/60"></textarea>
	{:else}
		<div
			class="mt-3 min-h-72 rounded-md border border-edge bg-void p-3"
			role="tabpanel"
			aria-label="Guide preview"
		>
			{#if guide.trim() === ''}
				<p class="text-sm text-muted">Nothing to preview yet.</p>
			{:else}
				<GuideBody source={guide} />
			{/if}
		</div>
	{/if}

	<div class="mt-3 flex items-center justify-between gap-2">
		<span
			class="text-xs tabular-nums {remaining < 200 ? 'text-card-yellow' : 'text-muted'}"
			aria-live="polite">{guide.length}/{GUIDE_MAX_LENGTH}</span
		>
		<button
			type="button"
			onclick={() => dialogEl.close()}
			class="rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void hover:bg-neon-dim"
			>Done</button
		>
	</div>
</dialog>
