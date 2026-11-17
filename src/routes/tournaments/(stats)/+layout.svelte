<script lang="ts">
	// What every statistics page is cut by, above it: a period (hidden until a `metas` row exists), the
	// kind of event (hidden until more than one kind has been ingested), and a floor on field size.
	// All three live in the URL, so a link carries them (`periodParams`).
	import { page } from '$app/state';
	import { FIELD_FLOORS } from '#lib/tournaments/period.js';
	import { withParams } from '#lib/tournaments/url.js';

	let { data, children } = $props();

	/** This page's URL with one choice swapped, and the page number dropped (it belongs to the old list). */
	const linkTo = (patch: Record<string, string | number | null>) =>
		withParams(page.url, patch, ['page']);
</script>

{#snippet chip(label: string, href: string, active: boolean)}
	<a
		{href}
		aria-current={active ? 'true' : undefined}
		class="rounded-full border px-3 py-1 {active
			? 'border-neon bg-neon/10 text-bright'
			: 'border-edge text-muted hover:text-body'}"
	>
		{label}
	</a>
{/snippet}

<div>
	<div
		class="mx-auto flex w-full max-w-6xl flex-wrap justify-end gap-x-6 gap-y-2 px-4 pt-4 font-mono text-xs"
	>
		{#if data.periods.length > 1}
			<nav class="flex flex-wrap items-center gap-1" aria-label="Period">
				<span class="mr-1 text-muted">Period</span>
				{#each data.periods as p (p.id)}
					{@render chip(p.name, linkTo({ period: p.id }), p.id === data.period.id)}
				{/each}
			</nav>
		{/if}
		{#if data.kinds.length > 1 || data.period.kind !== null}
			<nav class="flex flex-wrap items-center gap-1" aria-label="Kind of event">
				<span class="mr-1 text-muted">Kind</span>
				{@render chip('Any', linkTo({ kind: null }), data.period.kind === null)}
				{#each data.kinds as kind (kind)}
					{@render chip(kind, linkTo({ kind }), data.period.kind === kind)}
				{/each}
			</nav>
		{/if}
		<nav class="flex flex-wrap items-center gap-1" aria-label="Field size">
			<span class="mr-1 text-muted">Players</span>
			{@render chip('Any', linkTo({ min: null }), data.period.minPlayers === null)}
			{#each FIELD_FLOORS as floor (floor)}
				{@render chip(`${floor}+`, linkTo({ min: floor }), data.period.minPlayers === floor)}
			{/each}
		</nav>
	</div>
</div>

{@render children()}
