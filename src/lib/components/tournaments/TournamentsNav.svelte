<script lang="ts">
	// The tournaments section's navigation, and what the statistics pages are cut by (period, kind of
	// event, field size), in one sidebar, so neither takes a row off the top of every page. Collapsed it is
	// a rail of initials. The scope shows only on the statistics pages: an event's own page is not cut by
	// a meta. A link carries the scope with it (`periodParams`).
	import { page } from '$app/state';
	import { cn } from '#lib/cn.js';
	import LinkSelect from '#lib/components/tournaments/LinkSelect.svelte';
	import type { EventKind } from '#lib/tournaments/kind.js';
	import { FIELD_FLOORS, periodParams, type Period } from '#lib/tournaments/period.js';
	import { href, withParams } from '#lib/tournaments/url.js';

	let {
		period,
		periods,
		kinds,
		collapsed = false,
		ontoggle
	}: {
		period: Period;
		periods: readonly Period[];
		kinds: readonly EventKind[];
		/** A rail of initials, not the full list. */
		collapsed?: boolean;
		/** Present where the sidebar can be collapsed (not in the phone menu). */
		ontoggle?: () => void;
	} = $props();

	type Item = { label: string; path: string; on: (path: string) => boolean };
	type Section = Item & { initial: string; scoped: boolean; items: Item[] };

	const SECTIONS: Section[] = [
		{
			label: 'Events',
			initial: 'E',
			path: '/tournaments',
			scoped: false,
			on: (p) => p === '/tournaments' || /^\/tournaments\/\d/.test(p),
			items: []
		},
		{
			label: 'Meta',
			initial: 'M',
			path: '/tournaments/meta',
			scoped: true,
			// A card's own page is reached from the card breakdown, so it sits here.
			on: (p) => p.startsWith('/tournaments/meta') || p.startsWith('/tournaments/cards'),
			items: [
				{ label: 'Tier list', path: '/tournaments/meta', on: (p) => p === '/tournaments/meta' },
				{
					label: 'Matchups',
					path: '/tournaments/meta/matchups',
					on: (p) => p.startsWith('/tournaments/meta/matchups')
				},
				{
					label: 'Card breakdown',
					path: '/tournaments/meta/cards',
					on: (p) => p.startsWith('/tournaments/meta/cards') || p.startsWith('/tournaments/cards')
				}
			]
		},
		{
			label: 'Decks',
			initial: 'D',
			path: '/tournaments/decks',
			scoped: true,
			on: (p) => p.startsWith('/tournaments/decks'),
			items: [
				{
					label: 'All decks',
					path: '/tournaments/decks',
					on: (p) => p.startsWith('/tournaments/decks') && !p.startsWith('/tournaments/decks/lines')
				},
				{
					label: 'By Legends',
					path: '/tournaments/decks/lines',
					on: (p) => p.startsWith('/tournaments/decks/lines')
				}
			]
		}
	];

	const here = $derived(page.url.pathname);
	const scoped = $derived(SECTIONS.some((section) => section.scoped && section.on(here)));
	/** A link inside the statistics carries the scope; the events pages have none to carry. */
	const to = (section: Section, path: string) =>
		section.scoped ? href(path, periodParams(period)) : path;

	const linkTo = (patch: Record<string, string | number | null>) =>
		withParams(page.url, patch, ['page']);

	const periodOptions = $derived(
		periods.map((p) => ({
			value: p.id === null ? 'all' : String(p.id),
			label: p.name,
			href: linkTo({ period: p.param })
		}))
	);
	const kindOptions = $derived([
		{ value: '', label: 'All kinds', href: linkTo({ kind: null }) },
		...kinds.map((kind) => ({ value: kind, label: kind, href: linkTo({ kind }) }))
	]);
	const sizeOptions = $derived([
		{ value: '', label: 'Any', href: linkTo({ min: null }) },
		...FIELD_FLOORS.map((floor) => ({
			value: String(floor),
			label: `${floor}+`,
			href: linkTo({ min: floor })
		}))
	]);

	const ITEM = 'block rounded px-2 py-1';
</script>

{#if collapsed}
	<nav class="flex flex-col items-center gap-1.5" aria-label="Tournaments">
		{#each SECTIONS as section (section.path)}
			<a
				href={to(section, section.path)}
				title={section.label}
				aria-label={section.label}
				aria-current={section.on(here) ? 'page' : undefined}
				class={cn(
					'grid size-9 place-items-center rounded-md border font-mono text-sm',
					section.on(here)
						? 'border-neon bg-neon/10 text-bright'
						: 'border-edge text-muted hover:text-body'
				)}>{section.initial}</a
			>
		{/each}
		{#if scoped}
			<span
				class="mt-2 max-w-full truncate rounded border border-edge px-1 py-0.5 font-mono text-[10px] text-muted"
				title="Period: {period.name}">{period.id === null ? 'All' : period.name.slice(0, 4)}</span
			>
		{/if}
		{#if ontoggle}
			<button
				type="button"
				onclick={ontoggle}
				aria-label="Expand the sidebar"
				title="Expand"
				class="mt-2 grid size-9 place-items-center rounded-md text-muted hover:text-bright"
				>»</button
			>
		{/if}
	</nav>
{:else}
	<div class="flex flex-col gap-5">
		<nav class="font-mono text-sm" aria-label="Tournaments">
			<ul class="space-y-2">
				{#each SECTIONS as section (section.path)}
					<li>
						<a
							href={to(section, section.path)}
							aria-current={section.items.length === 0 && section.on(here) ? 'page' : undefined}
							class={cn(
								ITEM,
								section.on(here) ? 'text-bright' : 'text-muted hover:text-body',
								section.items.length === 0 && section.on(here) && 'bg-neon/10'
							)}>{section.label}</a
						>
						{#if section.items.length > 0}
							<ul class="mt-0.5 ml-3 space-y-0.5 border-l border-edge pl-2">
								{#each section.items as item (item.path)}
									<li>
										<a
											href={to(section, item.path)}
											aria-current={item.on(here) ? 'page' : undefined}
											class={cn(
												ITEM,
												'text-xs',
												item.on(here) ? 'bg-neon/10 text-bright' : 'text-muted hover:text-body'
											)}>{item.label}</a
										>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		</nav>

		{#if scoped}
			<div class="space-y-2.5 border-t border-edge pt-4" role="group" aria-label="Scope">
				<p class="font-mono text-[11px] tracking-wide text-muted uppercase">Scope</p>
				{#if periods.length > 1}
					<LinkSelect
						stacked
						label="Period"
						value={period.id === null ? 'all' : String(period.id)}
						options={periodOptions}
					/>
				{/if}
				{#if kinds.length > 1 || period.kind !== null}
					<LinkSelect stacked label="Kind" value={period.kind ?? ''} options={kindOptions} />
				{/if}
				<LinkSelect
					stacked
					label="Players"
					value={String(period.minPlayers ?? '')}
					options={sizeOptions}
				/>
			</div>
		{/if}

		{#if ontoggle}
			<button
				type="button"
				onclick={ontoggle}
				class="self-start rounded px-2 py-1 font-mono text-xs text-muted hover:text-bright"
				aria-label="Collapse the sidebar"
			>
				« Collapse
			</button>
		{/if}
	</div>
{/if}
