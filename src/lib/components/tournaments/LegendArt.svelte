<script lang="ts">
	// A Card's art by slug, with the site's own blur-up image. Used for the Legends beside a player, so
	// it renders a plain placeholder for a slug the dataset doesn't know rather than failing the page.
	import { cardOf } from '#lib/tournaments/present.js';
	import CardImage from '../CardImage.svelte';

	let {
		slug,
		sizes = '120px',
		class: className = ''
	}: { slug: string; sizes?: string; class?: string } = $props();

	const card = $derived(cardOf(slug));
</script>

{#if card}
	<div class="card-frame overflow-hidden rounded {className}">
		<CardImage
			printingId={card.printings[0].id}
			thumbhash={card.printings[0].thumbhash}
			color={card.color}
			alt={card.name}
			{sizes}
		/>
	</div>
{:else}
	<div
		class="flex card-frame items-center justify-center rounded border border-edge bg-surface text-[10px] text-muted {className}"
		title={slug}
	>
		?
	</div>
{/if}
