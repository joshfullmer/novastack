<script lang="ts">
	// A dropdown whose every choice is a link: choosing one navigates to that option's `href`, which the
	// caller builds from the page's own URL so every other filter is kept. Used for what a page is cut by
	// (period, kind of event, field size).
	import { goto } from '$app/navigation';

	let {
		label,
		value,
		options
	}: {
		label: string;
		/** The chosen option's `value`. */
		value: string;
		options: { value: string; label: string; href: string }[];
	} = $props();

	function choose(picked: string) {
		const option = options.find((o) => o.value === picked);
		if (option) void goto(option.href);
	}
</script>

<label class="flex items-center gap-1.5 font-mono text-xs text-muted">
	{label}
	<select
		{value}
		onchange={(event) => choose(event.currentTarget.value)}
		class="rounded border border-edge bg-shell px-2 py-1 text-body"
	>
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
</label>
