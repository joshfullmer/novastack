<script lang="ts">
	/**
	 * PROTOTYPE — DELETE ME WITH THE VARIANT ROUND.
	 *
	 * Flips a host page between `?variant=` renderings. Dev-only (`dev` gate below), so a stray
	 * merge can't ship the bar; deliberately loud and un-styled-like-the-app so it can't be
	 * mistaken for part of the design being judged.
	 */
	import { dev } from '$app/env';
	import { goto } from '$app/navigation';
	import { currentUrl } from '#lib/filters/shallow.js';

	let { variants, names = {} }: { variants: readonly string[]; names?: Record<string, string> } =
		$props();

	const current = $derived(currentUrl().searchParams.get('variant') ?? variants[0]);

	function step(delta: number) {
		const index = variants.indexOf(current);
		const next = variants[(index + delta + variants.length) % variants.length];
		const url = new URL(currentUrl().href);
		url.searchParams.set('variant', next);
		// `shallow` keeps the editor's in-progress local deck state alive — a real navigation would
		// re-run `load` and re-seed it, which would make the variants impossible to compare on the
		// same deck. `reset` defaults to false under shallow, so scroll and focus stay put.
		void goto(url, { replace: true, shallow: true });
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		const target = event.target as HTMLElement | null;
		// Don't steal the arrow keys from a text field, a select, or the query editor.
		if (target?.closest('input, textarea, select, [contenteditable]')) return;
		event.preventDefault();
		step(event.key === 'ArrowRight' ? 1 : -1);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if dev}
	<div
		class="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full
			border-2 border-fuchsia-400 bg-fuchsia-950/95 px-2 py-1 font-mono text-xs text-fuchsia-100
			shadow-2xl backdrop-blur"
	>
		<button
			type="button"
			onclick={() => step(-1)}
			aria-label="Previous variant"
			class="px-1.5 hover:text-white">←</button
		>
		<span class="px-1 whitespace-nowrap">
			PROTOTYPE {current}{names[current] ? ` — ${names[current]}` : ''}
		</span>
		<button
			type="button"
			onclick={() => step(1)}
			aria-label="Next variant"
			class="px-1.5 hover:text-white">→</button
		>
	</div>
{/if}
