<script lang="ts">
	/**
	 * PROTOTYPE — throwaway. Three variants of the collection page on one route, switchable via
	 * `?variant=A|B|C` and the floating bar. See NOTES.md for the question being answered.
	 */
	import { currentUrl } from '#lib/filters/shallow.js';
	import PrototypeSwitcher from './PrototypeSwitcher.svelte';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import VariantD from './VariantD.svelte';

	const variants = [
		{ key: 'A', name: 'Collection first' },
		{ key: 'B', name: 'Three peers in a rail' },
		{ key: 'C', name: 'Binder forward' },
		{ key: 'D', name: 'Entry console' }
	];

	// `currentUrl()`, not `page.url`: a shallow update leaves `page.url` on the URL we started at.
	const current = $derived(
		variants.some((variant) => variant.key === currentUrl().searchParams.get('variant'))
			? currentUrl().searchParams.get('variant')!
			: 'A'
	);
</script>

<svelte:head><title>Collection prototype — novastack</title></svelte:head>

{#if current === 'A'}
	<VariantA />
{:else if current === 'B'}
	<VariantB />
{:else if current === 'C'}
	<VariantC />
{:else}
	<VariantD />
{/if}

<PrototypeSwitcher {variants} {current} />
