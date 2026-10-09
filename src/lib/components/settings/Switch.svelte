<script lang="ts">
	/**
	 * An on/off switch. A real button with `role="switch"`, so it works from the keyboard and reads
	 * correctly to a screen reader; the caller owns the state and what a click does.
	 */
	let {
		checked,
		onclick,
		labelledby,
		describedby
	}: {
		checked: boolean;
		onclick: () => void;
		labelledby: string;
		describedby?: string;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-labelledby={labelledby}
	aria-describedby={describedby}
	{onclick}
	class="flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors
		{checked ? 'bg-neon' : 'bg-raised ring-1 ring-edge ring-inset'}"
>
	<span
		class="size-5 rounded-full transition-transform
			{checked ? 'translate-x-5 bg-void' : 'translate-x-0 bg-muted'}"
	></span>
</button>
