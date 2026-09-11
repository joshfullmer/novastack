<script lang="ts">
	/**
	 * General Rulings — the FAQ API's `scope: "game"` entries, tied to no Card.
	 *
	 * A card's own rulings live on its detail page (`Card.faqs`); this page is what that page's
	 * "See General Rulings" link points at. Same `+page.svelte`-imports-`dataset`-directly pattern
	 * as `/sets` — no `+page.ts` needed, `data.origin` comes from the root layout.
	 */
	import { dataset } from '#lib/cards/index.js';
	import FaqText from '#lib/components/FaqText.svelte';
	import Meta from '#lib/components/Meta.svelte';

	let { data } = $props();
</script>

<Meta
	title="FAQ — novastack"
	description="General rulings for the Cyberpunk TCG, not tied to any one card."
	origin={data.origin}
	path="/faq"
/>

<div class="mx-auto max-w-3xl p-6 sm:p-10">
	<h1 class="mb-2 text-3xl font-semibold text-bright">General Rulings</h1>
	<p class="mb-10 text-muted">
		Rulings that apply across the game, not to any one card. For a card's own rulings, see its card
		page.
	</p>

	<dl class="space-y-8">
		{#each dataset.generalFaqs as faq (faq.id)}
			<div>
				<dt class="font-medium text-body">
					<FaqText text={faq.question} />
				</dt>
				<dd class="mt-1 text-muted">
					<FaqText text={faq.answer} />
				</dd>
			</div>
		{/each}
	</dl>
</div>
