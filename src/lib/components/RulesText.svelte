<script lang="ts">
	/**
	 * Renders structured rules-text segments.
	 *
	 * This component holds **no game knowledge and no regexes** — all five markup systems were
	 * resolved at ingest time, so this is a mapping from segment kind to markup and nothing else.
	 * Adding a keyword to the game changes `vocabulary.ts`, not this file.
	 *
	 * Three segment kinds are interactive, and each reuses a mechanism that already exists rather
	 * than inventing a new one: keywords and classifications are filter links, card references
	 * are card links. `reminder` and `symbol` stay inert.
	 */
	import type { Paragraph } from '#lib/cards/rules-text.js';
	import { PARAM } from '#lib/filters/state.js';
	import { slugifyValue } from '#lib/filters/state.js';

	let {
		paragraphs,
		/** The detail pane is narrow; the detail page can afford more room. */
		size = 'base'
	}: { paragraphs: readonly Paragraph[]; size?: 'sm' | 'base' } = $props();

	const linkClass =
		'underline decoration-dotted decoration-neon-dim underline-offset-2 hover:text-neon';
</script>

{#if paragraphs.length === 0}
	<p class="text-muted italic">No rules text.</p>
{:else}
	<div class="space-y-2 {size === 'sm' ? 'text-sm' : 'text-base'} leading-relaxed">
		{#each paragraphs as paragraph, index (index)}
			<p>
				{#each paragraph as segment, position (position)}
					{#if segment.kind === 'text'}{segment.text}{:else if segment.kind === 'keyword'}
						<a
							href="/cards?{PARAM.keywords}={slugifyValue(segment.keyword)}"
							class="font-semibold text-bright {linkClass}">{segment.keyword}</a
						>
					{:else if segment.kind === 'classification'}
						<a
							href="/cards?{PARAM.tags}={slugifyValue(segment.classification)}"
							class="font-medium tracking-wide text-bright {linkClass}">{segment.text}</a
						>
					{:else if segment.kind === 'cardRef'}
						<a href="/cards/{segment.slug}" class="font-medium text-bright {linkClass}"
							>{segment.text}</a
						>
					{:else if segment.kind === 'nameFragment'}
						<!-- Looks like a card name but matches none. Styled, deliberately not linked. -->
						<span class="font-medium tracking-wide text-bright">{segment.text}</span>
					{:else if segment.kind === 'symbol'}
						<span
							class="font-mono text-neon"
							aria-label={segment.symbol === 'eurodollars' ? 'eurodollars' : 'Street Cred'}
							>{segment.text}</span
						>
					{:else if segment.kind === 'reminder'}
						<!-- De-emphasised so the effect reads before the explanation. -->
						<span class="text-[0.9em] text-muted italic">{segment.text}</span>
					{/if}
				{/each}
			</p>
		{/each}
	</div>
{/if}
