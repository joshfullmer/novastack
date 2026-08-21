<script lang="ts">
	/**
	 * A dual-thumb numeric range with an explicit `+ none` bucket.
	 *
	 * **Two thumbs, not one.** A single `≤ N` thumb cannot express "power ≥ 10", and half the
	 * useful queries in this dataset are lower bounds.
	 *
	 * **A thumb parked at a domain edge means unbounded**, and serialises as absent — so "no
	 * filter" and "full range" collapse to one canonical state and one canonical URL.
	 *
	 * **A null is a distinct bucket and never zero.** No bound ever reaches null, so the `+ none`
	 * toggle carries the count it admits: without it, `power ≥ 0` silently drops 45 cards while
	 * looking like it selected everything.
	 *
	 * Keyboard operability comes free from the construction the spec asks for — two focusable
	 * `input[type=range]` elements sharing one track.
	 */
	import type { NumericDomain } from '#lib/cards/dataset.js';
	import type { NumericRange } from '#lib/filters/chips.js';

	let {
		legend,
		domain,
		value,
		onChange
	}: {
		legend: string;
		domain: NumericDomain;
		value: NumericRange;
		onChange: (next: NumericRange) => void;
	} = $props();

	const lo = $derived(value.min ?? domain.min);
	const hi = $derived(value.max ?? domain.max);

	/** An edge-parked thumb is unbounded, which is what keeps one state to one URL. */
	const bound = (raw: number, edge: number): number | null => (raw === edge ? null : raw);

	function setLo(raw: number) {
		const next = Math.min(raw, hi);
		onChange({ ...value, min: bound(next, domain.min) });
	}

	function setHi(raw: number) {
		const next = Math.max(raw, lo);
		onChange({ ...value, max: bound(next, domain.max) });
	}

	const span = $derived(Math.max(1, domain.max - domain.min));
	const leftPct = $derived(((lo - domain.min) / span) * 100);
	const rightPct = $derived(((hi - domain.min) / span) * 100);

	const summary = $derived(
		value.min === null && value.max === null ? 'any' : lo === hi ? `${lo}` : `${lo}–${hi}`
	);

	const thumbClass =
		'pointer-events-none absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent ' +
		'[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 ' +
		'[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full ' +
		'[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-void ' +
		'[&::-webkit-slider-thumb]:bg-neon [&::-moz-range-thumb]:pointer-events-auto ' +
		'[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none ' +
		'[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 ' +
		'[&::-moz-range-thumb]:border-void [&::-moz-range-thumb]:bg-neon';
</script>

<fieldset class="min-w-[11rem]">
	<legend
		class="mb-1.5 flex w-full items-baseline gap-2 text-xs tracking-wide text-muted uppercase"
	>
		<span class="font-medium">{legend}</span>
		<span class="text-body normal-case tabular-nums">{summary}</span>

		{#if domain.nullCount > 0}
			<!--
				The null bucket, inline on the legend line rather than a checkbox row underneath. It
				still has to be *visible* — a bound silently dropping 45 cards is the failure mode this
				control exists to prevent — but a stacked checkbox under every range crowded the row
				without earning it. The glyph is the same `—` used for a null stat everywhere else.
			-->
			<button
				type="button"
				aria-pressed={value.includeNull}
				aria-label="Include the {domain.nullCount} cards with no {legend.toLowerCase()}"
				title="Include the {domain.nullCount} cards with no {legend.toLowerCase()}"
				onclick={() => onChange({ ...value, includeNull: !value.includeNull })}
				class="ml-auto rounded border px-1.5 font-mono text-[0.7rem] leading-relaxed
					transition-colors {value.includeNull
					? 'border-neon-dim text-neon'
					: 'border-edge text-muted/60 hover:border-muted'}"
			>
				— {domain.nullCount}
			</button>
		{/if}
	</legend>

	<div class="relative h-6">
		<div class="absolute inset-x-0 top-2.5 h-1 rounded-full bg-edge"></div>
		<div
			class="absolute top-2.5 h-1 rounded-full bg-neon-dim"
			style="left: {leftPct}%; right: {100 - rightPct}%"
		></div>

		<input
			type="range"
			min={domain.min}
			max={domain.max}
			value={lo}
			aria-label="{legend} minimum"
			oninput={(event) => setLo(event.currentTarget.valueAsNumber)}
			class={thumbClass}
		/>
		<input
			type="range"
			min={domain.min}
			max={domain.max}
			value={hi}
			aria-label="{legend} maximum"
			oninput={(event) => setHi(event.currentTarget.valueAsNumber)}
			class={thumbClass}
		/>
	</div>
</fieldset>
