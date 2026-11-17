<script lang="ts">
	// A deck's RAM as players say it: `YYR`, a letter per Legend, each in its colour. A RAM whose Legends
	// don't provide alike has no such shorthand and shows one letter per RAM (`yyyyrr`) instead. The
	// letters are never the only carrier: the title spells it out.
	import { COLOR_TEXT } from '#lib/components/color.js';
	import { cn } from '#lib/cn.js';
	import { RAM_PER_LEGEND } from '#lib/tournaments/present.js';
	import { ramLabel, ramParts, ramShorthand } from '#lib/tournaments/ram.js';

	let { ram, class: className = '' }: { ram: string; class?: string } = $props();

	const parts = $derived(ramParts(ram));
	const short = $derived(ramShorthand(ram, RAM_PER_LEGEND) !== null);
	/** One entry per letter shown, in the order said. */
	const letters = $derived(
		parts.flatMap(({ colour, amount }) =>
			Array.from({ length: short ? amount / RAM_PER_LEGEND : amount }, () => colour)
		)
	);
	const spelled = $derived(parts.map(({ colour, amount }) => `${colour} ${amount}`).join(' · '));
</script>

<span
	class={cn('font-mono tracking-wider', className)}
	title="{spelled} RAM{short ? ` (${ramLabel(ram)})` : ''}"
	>{#each letters as colour, i (i)}<span class={COLOR_TEXT[colour]}
			>{short ? colour[0] : colour[0].toLowerCase()}</span
		>{/each}</span
>
