<script lang="ts">
	// What every statistics page is cut by, above it: a period (hidden until a `metas` row exists), the
	// kind of event (hidden until more than one kind has been ingested), and a floor on field size.
	// All three live in the URL, so a link carries them (`periodParams`).
	import { page } from '$app/state';
	import KindSelect from '#lib/components/tournaments/KindSelect.svelte';
	import { FIELD_FLOORS } from '#lib/tournaments/period.js';
	import { withParams } from '#lib/tournaments/url.js';

	let { data, children } = $props();

	/** Up to this many periods are chips; more are a menu. */
	const MAX_PILLS = 4;
	let menuOpen = $state(false);
	// A choice navigates within this layout, so the menu would stay open over the new page.
	$effect(() => {
		void page.url;
		menuOpen = false;
	});

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
			{#if data.periods.length <= MAX_PILLS}
				<nav class="flex flex-wrap items-center gap-1" aria-label="Period">
					<span class="mr-1 text-muted">Period</span>
					{#each data.periods as p (p.id)}
						{@render chip(p.name, linkTo({ period: p.param }), p.id === data.period.id)}
					{/each}
				</nav>
			{:else}
				<!-- Many metas: a menu, so a year of them doesn't wrap the page. -->
				<details class="relative" bind:open={menuOpen}>
					<summary
						class="cursor-pointer list-none rounded-full border border-edge px-3 py-1 text-bright"
					>
						<span class="mr-1 text-muted">Period</span>
						{data.period.name} ▾
					</summary>
					<nav
						class="absolute right-0 z-10 mt-1 flex max-h-80 min-w-48 flex-col overflow-y-auto rounded-lg border border-edge bg-shell p-1"
						aria-label="Period"
					>
						{#each data.periods as p (p.id)}
							<a
								href={linkTo({ period: p.param })}
								aria-current={p.id === data.period.id ? 'true' : undefined}
								class="rounded px-3 py-1.5 {p.id === data.period.id
									? 'bg-neon/10 text-bright'
									: 'text-muted hover:text-body'}">{p.name}</a
							>
						{/each}
					</nav>
				</details>
			{/if}
		{/if}
		{#if data.kinds.length > 1 || data.period.kind !== null}
			<KindSelect
				kinds={data.kinds.map((kind) => ({ kind }))}
				value={data.period.kind}
				href={(kind) => linkTo({ kind })}
			/>
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
