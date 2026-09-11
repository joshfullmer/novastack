<script lang="ts">
	/**
	 * Renders one FAQ question or answer, bolding its `[Bracket]` tokens.
	 *
	 * Deliberately not `RulesText`-shaped: no segment kinds, no links, no vocabulary lookup — see
	 * `faq.ts`'s module comment for why this markup doesn't get the same treatment.
	 */
	import { segmentFaqText } from '#lib/cards/faq.js';

	let { text }: { text: string } = $props();

	const segments = $derived(segmentFaqText(text));
</script>

{#each segments as segment, index (index)}{#if segment.bold}<strong
			class="font-semibold text-bright">{segment.text}</strong
		>{:else}{segment.text}{/if}{/each}
