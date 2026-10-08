<script lang="ts">
	/**
	 * An (i) button and the small panel it opens — for the explanation that earns its place beside a
	 * figure but not on top of it.
	 *
	 * A disclosure rather than a tooltip: a tooltip is hover-only and vanishes when you reach for
	 * what is in it, and this holds controls (the marketplace switch) and text worth selecting. The
	 * button owns `aria-expanded`; Escape and a click anywhere outside close it, and Escape hands
	 * focus back to the button so a keyboard user is not stranded.
	 *
	 * Hangs from the button by default. `anchorToHost` hangs it from the nearest positioned ancestor
	 * instead — for a button that sits inside a small panel, where opening *under the button* would
	 * cover the very figure the panel is for. Either way the host must not clip overflow.
	 */
	import type { Snippet } from 'svelte';

	let {
		label,
		children,
		anchorToHost = false,
		class: className = ''
	}: { label: string; children: Snippet; anchorToHost?: boolean; class?: string } = $props();

	const panelId = $props.id();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let button = $state<HTMLButtonElement>();

	function onWindowClick(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		open = false;
		button?.focus();
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<span bind:this={root} class="inline-flex {anchorToHost ? '' : 'relative'}">
	<button
		bind:this={button}
		type="button"
		aria-label={label}
		aria-expanded={open}
		aria-controls={panelId}
		onclick={() => (open = !open)}
		class="grid size-5 place-items-center rounded-full border border-neon/40 font-serif text-[0.7rem]
			leading-none text-neon italic transition-colors hover:border-neon hover:bg-neon/10
			{open ? 'border-neon bg-neon/10' : ''}">i</button
	>
	{#if open}
		<div
			id={panelId}
			class="absolute top-full right-0 z-30 mt-2 w-72 rounded-lg border border-edge bg-shell p-3
				text-xs text-muted shadow-lg shadow-black/50 {className}"
		>
			{@render children()}
		</div>
	{/if}
</span>
