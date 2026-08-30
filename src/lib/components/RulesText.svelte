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
	 *
	 * A "Choose one effect" line renders as a list, not a run-on sentence — `splitChoiceOptions`
	 * (`rules-text.ts`) is the one place that knows how a paragraph turns into one; this only asks
	 * "did it," and renders a `<ul>` instead of a `<p>` when it did.
	 */
	import { splitChoiceOptions, type Paragraph, type Segment } from '#lib/cards/rules-text.js';
	import { quoteQueryValue } from '#lib/cards/dataset.js';
	import { PARAM } from '#lib/filters/state.js';

	let {
		paragraphs,
		/** The detail pane is narrow; the detail page can afford more room. */
		size = 'base'
	}: { paragraphs: readonly Paragraph[]; size?: 'sm' | 'base' } = $props();

	const linkClass =
		'underline decoration-dotted decoration-neon-dim underline-offset-2 hover:text-neon';
</script>

{#snippet renderSegment(segment: Segment)}
	{#if segment.kind === 'text'}{segment.text}{:else if segment.kind === 'keyword'}
		<a
			href="/cards?{PARAM.query}={encodeURIComponent(
				`keyword:${quoteQueryValue(segment.keyword)}`
			)}"
			class="font-semibold text-bright uppercase {linkClass}">{segment.keyword}</a
		>
	{:else if segment.kind === 'classification'}
		<a
			href="/cards?{PARAM.query}={encodeURIComponent(
				`tag:${quoteQueryValue(segment.classification)}`
			)}"
			class="font-medium tracking-wide text-bright {linkClass}">{segment.text}</a
		>
	{:else if segment.kind === 'cardRef'}
		<a href="/cards/{segment.slug}" class="font-medium text-bright {linkClass}">{segment.text}</a>
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
	{:else if segment.kind === 'choicePrompt' || segment.kind === 'dieSize'}
		<!-- The printed card bolds both: the "Choose one effect" prompt, and a called-out die
			size ("d4", "d6", "d20"). Neither is interactive. -->
		<span class="font-semibold text-bright">{segment.text}</span>
	{/if}
{/snippet}

{#if paragraphs.length === 0}
	<p class="text-muted italic">No rules text.</p>
{:else}
	<div class="space-y-2 {size === 'sm' ? 'text-sm' : 'text-base'} leading-relaxed">
		{#each paragraphs as paragraph, index (index)}
			{@const options = splitChoiceOptions(paragraph)}
			{#if options !== null}
				<ul class="list-disc space-y-1 pl-5">
					{#each options as option, optionIndex (optionIndex)}
						<li>
							{#each option as segment, position (position)}
								{@render renderSegment(segment)}
							{/each}
						</li>
					{/each}
				</ul>
			{:else}
				<p>
					{#each paragraph as segment, position (position)}
						{@render renderSegment(segment)}
					{/each}
				</p>
			{/if}
		{/each}
	</div>
{/if}
