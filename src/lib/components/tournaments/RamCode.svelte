<script lang="ts">
	// A deck's RAM as players say it: one letter per RAM, the dominant colour first (`yyyyrr`), each run
	// in its colour. The letters are never the only carrier: the title spells it out.
	import { COLOR_TEXT } from '#lib/components/color.js';
	import { cn } from '#lib/cn.js';
	import { ramParts } from '#lib/tournaments/ram.js';

	let { ram, class: className = '' }: { ram: string; class?: string } = $props();

	const parts = $derived(ramParts(ram));
	const spelled = $derived(parts.map(({ colour, amount }) => `${colour} ${amount}`).join(' · '));
</script>

<span class={cn('font-mono tracking-wider', className)} title="{spelled} RAM"
	>{#each parts as { colour, amount } (colour)}<span class={COLOR_TEXT[colour]}
			>{colour[0].toLowerCase().repeat(amount)}</span
		>{/each}</span
>
