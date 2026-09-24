<script lang="ts">
	/** PROTOTYPE — throwaway. The −/count/+ control the whole feature's entry UX hangs on. */
	let {
		count,
		onAdjust,
		compact = false
	}: { count: number; onAdjust: (delta: number) => void; compact?: boolean } = $props();
</script>

<div
	class="flex items-center justify-between gap-1 rounded-md bg-void/85 backdrop-blur-sm
		{compact ? 'px-1 py-0.5' : 'px-1.5 py-1'}"
>
	<button
		onclick={(event) => {
			event.preventDefault();
			onAdjust(-1);
		}}
		disabled={count === 0}
		class="grid size-6 place-items-center rounded text-base leading-none text-muted
			hover:bg-raised hover:text-bright disabled:opacity-25 disabled:hover:bg-transparent"
		aria-label="Remove a copy">−</button
	>
	<span
		class="min-w-7 text-center font-mono text-sm tabular-nums
			{count === 0 ? 'text-muted/50' : 'text-bright'}">{count === 0 ? '—' : `×${count}`}</span
	>
	<button
		onclick={(event) => {
			event.preventDefault();
			onAdjust(1);
		}}
		class="grid size-6 place-items-center rounded text-base leading-none text-neon
			hover:bg-raised hover:text-bright"
		aria-label="Add a copy">+</button
	>
</div>
