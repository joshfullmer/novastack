<script lang="ts">
	// A pill toggle that lives in the address: each option is a link to the page with that choice made, so a
	// view can be shared, bookmarked and stepped back through. The page doesn't jump back to the top.
	let {
		label,
		options,
		value,
		href
	}: {
		/** What the group is for, said to a screen reader. */
		label: string;
		options: readonly (readonly [key: string, text: string])[];
		value: string;
		/** Where an option goes: the current page with that choice made. */
		href: (key: string) => string;
	} = $props();
</script>

<div
	class="flex rounded-full border border-edge p-0.5 font-mono text-xs"
	role="group"
	aria-label={label}
>
	{#each options as [key, text] (key)}
		<a
			rel="nofollow"
			data-sveltekit-noscroll
			href={href(key)}
			aria-current={value === key ? 'true' : undefined}
			class="rounded-full px-3 py-1 {value === key
				? 'bg-neon text-void'
				: 'text-muted hover:text-body'}">{text}</a
		>
	{/each}
</div>
