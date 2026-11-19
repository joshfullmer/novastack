<script lang="ts">
	// A dropdown of checkboxes whose every row is a link: each goes to the page's own URL with that one
	// choice switched, so every other filter is kept and the menu works without JavaScript. The menu stays
	// open between choices (the component outlives the navigation), so several can be picked in a row;
	// it closes on an outside click or Escape. Used for what a page is cut by where more than one value
	// can count (kinds of event).
	import { cn } from '#lib/cn.js';

	type Option = { value: string; label: string; selected: boolean; href: string; hint?: string };

	let {
		label,
		summary,
		options,
		clear,
		presets = [],
		stacked = false
	}: {
		label: string;
		/** What the closed control says: the choice in words. */
		summary: string;
		/** A narrow column: the label above a full-width control, not beside it. */
		stacked?: boolean;
		options: Option[];
		/** Choosing none, which means "any"; shown as the first row when something is chosen. */
		clear: { label: string; href: string; active: boolean };
		/** Shortcuts that choose several at once. */
		presets?: { label: string; href: string; active: boolean }[];
	} = $props();

	let menu: HTMLDetailsElement | undefined = $state();
	const id = $props.id();

	const ROW = 'flex items-center gap-2 rounded px-2 py-1 whitespace-nowrap hover:bg-surface';
</script>

<svelte:window
	onclick={(event) => {
		if (menu?.open && event.target instanceof Node && !menu.contains(event.target))
			menu.open = false;
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape' && menu?.open) {
			menu.open = false;
			menu.querySelector('summary')?.focus();
		}
	}}
/>

<div
	class={cn(
		'flex font-mono text-xs text-muted',
		stacked ? 'flex-col items-stretch gap-1' : 'items-center gap-1.5'
	)}
>
	<span id="{id}-label">{label}</span>
	<details bind:this={menu} class="relative">
		<summary
			aria-labelledby="{id}-label {id}-summary"
			class="flex cursor-pointer list-none items-center justify-between gap-2 rounded border border-edge bg-shell px-2 py-1 text-body marker:hidden [&::-webkit-details-marker]:hidden"
		>
			<span id="{id}-summary">{summary}</span>
			<span aria-hidden="true" class="text-muted">▾</span>
		</summary>
		<ul
			role="menu"
			aria-labelledby="{id}-label"
			class="absolute z-30 mt-1 min-w-full rounded border border-edge bg-shell p-1 text-body shadow-lg"
		>
			<li role="none">
				<a
					role="menuitemradio"
					aria-checked={clear.active}
					href={clear.href}
					class={cn(ROW, clear.active && 'text-bright')}
				>
					<span aria-hidden="true" class="w-3 text-neon">{clear.active ? '✓' : ''}</span>
					{clear.label}
				</a>
			</li>
			{#each presets as preset (preset.label)}
				<li role="none">
					<a
						role="menuitemradio"
						aria-checked={preset.active}
						href={preset.href}
						class={cn(ROW, preset.active && 'text-bright')}
					>
						<span aria-hidden="true" class="w-3 text-neon">{preset.active ? '✓' : ''}</span>
						{preset.label}
					</a>
				</li>
			{/each}
			<li role="separator" class="my-1 border-t border-edge"></li>
			{#each options as option (option.value)}
				<li role="none">
					<a
						role="menuitemcheckbox"
						aria-checked={option.selected}
						href={option.href}
						class={cn(ROW, option.selected && 'text-bright')}
					>
						<span
							aria-hidden="true"
							class={cn(
								'grid size-3.5 place-items-center rounded-sm border text-[10px] leading-none',
								option.selected ? 'border-neon bg-neon/20 text-neon' : 'border-edge'
							)}>{option.selected ? '✓' : ''}</span
						>
						{option.label}
						{#if option.hint}<span class="ml-auto pl-3 text-muted">{option.hint}</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	</details>
</div>
