<script lang="ts">
	/**
	 * PROTOTYPE — throwaway. Floating variant switcher; delete with the rest of this folder.
	 *
	 * Deliberately ugly and high-contrast so it reads as scaffolding rather than as part of the
	 * design under evaluation. Dev-only: `import.meta.env.DEV` means a stray merge can't ship it.
	 */
	import { goto } from '$app/navigation';

	let { variants, current }: { variants: { key: string; name: string }[]; current: string } =
		$props();

	const index = $derived(
		Math.max(
			0,
			variants.findIndex((variant) => variant.key === current)
		)
	);

	/** Shallow, matching `/cards` and `/sets/[id]`: the URL changes, the page doesn't reload. */
	function cycle(step: number) {
		const next = variants[(index + step + variants.length) % variants.length];
		void goto(`?variant=${next.key}`, { shallow: true, replace: true });
	}

	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (
			target &&
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.isContentEditable)
		)
			return;
		if (event.key === 'ArrowLeft') cycle(-1);
		if (event.key === 'ArrowRight') cycle(1);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if import.meta.env.DEV}
	<div
		class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full
			border-2 border-fuchsia-400 bg-black/90 p-1.5 shadow-2xl backdrop-blur"
	>
		<button
			onclick={() => cycle(-1)}
			class="grid size-8 place-items-center rounded-full text-fuchsia-300 hover:bg-fuchsia-400/20"
			aria-label="Previous variant">←</button
		>
		<span class="px-3 font-mono text-xs tracking-wide text-fuchsia-200 uppercase">
			PROTOTYPE · {variants[index].key} — {variants[index].name}
		</span>
		<button
			onclick={() => cycle(1)}
			class="grid size-8 place-items-center rounded-full text-fuchsia-300 hover:bg-fuchsia-400/20"
			aria-label="Next variant">→</button
		>
	</div>
{/if}
