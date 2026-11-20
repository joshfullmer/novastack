<script lang="ts">
	// The tournament list, in two views of the same events: a dense List for scanning, and a Gallery
	// for browsing. The choice is a cookie read on the server (`data.view`), like every other List/Gallery
	// toggle in the app, so the first render already matches and no link needs to carry it.
	import { cn } from '#lib/cn.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';
	import { metaNoindex } from '#lib/meta/launch.js';
	import { cookieState } from '#lib/cookie-state.svelte.js';
	import ViewToggle from '#lib/components/deck/ViewToggle.svelte';
	import LinkMultiSelect from '#lib/components/tournaments/LinkMultiSelect.svelte';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import {
		fieldByColour,
		formatDate,
		legendNames,
		ordinal,
		wherePlayed
	} from '#lib/tournaments/present.js';
	import { formatKinds, kindsAtLeast, kindsSummary, toggleKind } from '#lib/tournaments/kind.js';
	import { withParams } from '#lib/tournaments/url.js';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const view = cookieState('tournaments-list-view', data.view);
	const VIEWS = ['list', 'gallery'] as const;
	const go = (n: number) => withParams(page.url, { page: n === 1 ? null : n });

	const TINT = {
		Red: cn('bg-card-red'),
		Yellow: cn('bg-card-yellow'),
		Green: cn('bg-card-green'),
		Blue: cn('bg-card-blue')
	};
	/**
	 * On hover each Legend rises a beat after the one before it. `group-hover:` scopes the delay to the
	 * way in, so moving off the tile drops them together. Whole class names, so Tailwind finds them.
	 */
	const HOVER_DELAY = ['', cn('group-hover:delay-75'), cn('group-hover:delay-150')];

	/** This page's own query with some of it changed; a filter or view change starts again at page 1. */
	const link = (patch: Record<string, string | number | null>) =>
		withParams(page.url, patch, ['page']);
	const query = $derived(data.query);
	const filtered = $derived(query.kinds.length > 0 || query.year !== null || query.q !== null);

	// Search as you type: the list follows the box a beat after the last keystroke, replacing the
	// history entry so Back doesn't walk through every prefix. The form still submits on Enter, so it
	// works without JavaScript.
	const SEARCH_DELAY = 300;
	let searchBox: HTMLInputElement | undefined;
	// svelte-ignore state_referenced_locally
	let text = $state(query.q ?? '');
	let pending: ReturnType<typeof setTimeout> | undefined;

	function search() {
		clearTimeout(pending);
		pending = setTimeout(
			() => goto(link({ q: text.trim() || null }), { replace: true, reset: false }),
			SEARCH_DELAY
		);
	}

	// Follow the address (Back, Clear filters) — but never overwrite what is being typed, which
	// runs ahead of the results.
	$effect(() => {
		const q = query.q ?? '';
		if (document.activeElement !== searchBox) text = q;
	});
	$effect(() => () => clearTimeout(pending));
</script>

<!-- `noindex` until Meta is public, and on any filtered view (`metaNoindex`). -->
<Meta
	title="Tournaments — Meta — novastack"
	description="Cyberpunk TCG tournament results and decklists."
	origin={data.origin}
	path="/meta/tournaments"
	noindex={metaNoindex(page.url)}
/>

<!-- The extra plain wrapper matters: `<main>` (root layout) is a column flex container, and a
     `mx-auto max-w-…` box that is a *direct* flex child has its stretch behaviour disabled. -->
<div>
	<div class="py-6">
		<header class="flex flex-wrap items-end justify-between gap-3 border-b border-edge pb-4">
			<div>
				<h1 class="font-mono text-xl text-bright">Tournaments</h1>
				<p class="font-mono text-xs text-muted">
					{data.total} events · {data.players} players
				</p>
			</div>
			<ViewToggle value={view.value} options={VIEWS} onchange={(next) => (view.value = next)} />
		</header>

		{#snippet chip(label: string, href: string, active: boolean, count?: number)}
			<a
				{href}
				aria-current={active ? 'true' : undefined}
				class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] {active
					? 'border-neon bg-neon/10 text-bright'
					: 'border-edge text-muted hover:text-body'}"
			>
				{label}{#if count !== undefined}<span class="ml-1 text-muted">{count}</span>{/if}
			</a>
		{/snippet}

		<div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2" role="group" aria-label="Filter">
			<form
				method="get"
				action="/meta/tournaments"
				role="search"
				onsubmit={() => clearTimeout(pending)}
			>
				{#if query.kinds.length > 0}<input
						type="hidden"
						name="kind"
						value={formatKinds(query.kinds)}
					/>{/if}
				{#if query.year}<input type="hidden" name="year" value={query.year} />{/if}
				<input
					bind:this={searchBox}
					bind:value={text}
					oninput={search}
					type="search"
					name="q"
					maxlength="60"
					placeholder="Event or organizer"
					aria-label="Search events"
					class="w-52 rounded border border-edge bg-shell px-2.5 py-1 font-mono text-xs text-body placeholder:text-muted"
				/>
			</form>
			<LinkMultiSelect
				label="Kind"
				summary={kindsSummary(query.kinds)}
				options={data.kinds.map(({ kind, count }) => ({
					value: kind,
					label: kind,
					hint: String(count),
					selected: query.kinds.includes(kind),
					href: link({ kind: formatKinds(toggleKind(query.kinds, kind)) })
				}))}
				clear={{
					label: 'All kinds',
					href: link({ kind: null }),
					active: query.kinds.length === 0
				}}
				presets={data.kinds.some((entry) => entry.kind === 'Showdown')
					? [
							{
								label: 'Showdown and bigger',
								href: link({ kind: formatKinds(kindsAtLeast('Showdown')) }),
								active: formatKinds(query.kinds) === formatKinds(kindsAtLeast('Showdown'))
							}
						]
					: []}
			/>
			{#if data.years.length > 1}
				<div class="flex flex-wrap gap-1.5" aria-label="Year">
					{@render chip('Any year', link({ year: null }), query.year === null)}
					{#each data.years as year (year)}
						{@render chip(String(year), link({ year }), query.year === year)}
					{/each}
				</div>
			{/if}
			{#if filtered}
				<a
					href={link({ kind: null, year: null, q: null })}
					class="font-mono text-[11px] text-muted underline hover:text-body">Clear filters</a
				>
			{/if}
		</div>

		{#if data.events.length === 0}
			<p class="mt-8 text-center text-sm text-muted">
				{filtered ? 'No events match those filters.' : 'No tournaments have been added yet.'}
			</p>
		{:else if view.value === 'list'}
			<div
				class="mt-3 grid grid-cols-[6.5rem_1fr_3rem_3rem_16rem] gap-x-4 px-2 font-mono text-[11px] tracking-wide text-muted uppercase"
				aria-hidden="true"
			>
				<span>Date</span><span>Event</span><span class="text-right">Players</span><span
					class="text-right">Decks</span
				>
				<span>Winner</span>
			</div>

			<ul class="mt-1 divide-y divide-edge/60">
				{#each data.events as event (event.id)}
					<li>
						<a
							href="/meta/tournaments/{event.id}"
							class="grid grid-cols-[6.5rem_1fr_3rem_3rem_16rem] items-center gap-x-4 rounded px-2 py-2.5 hover:bg-surface"
						>
							<span class="font-mono text-xs text-muted">{formatDate(event.startsAt)}</span>
							<span class="min-w-0">
								<span class="block truncate text-bright">{event.name}</span>
								<span class="block truncate text-xs text-muted">
									{#if event.kind !== 'Other'}<span class="text-neon">{event.kind}</span> ·
									{/if}{wherePlayed(event.organizer, event.venue)} · {event.roundCount} rounds
								</span>
							</span>
							<span class="text-right font-mono text-sm">{event.playerCount}</span>
							<span class="text-right font-mono text-sm {event.deckCount ? '' : 'text-muted'}">
								{event.deckCount || '—'}
							</span>
							<span class="flex items-center gap-2">
								{#if event.showcase}
									<span class="flex -space-x-2">
										{#each event.showcase.legends as slug (slug)}
											<LegendArt {slug} sizes="40px" class="w-6 ring-1 ring-void" />
										{/each}
									</span>
								{/if}
								<span class="min-w-0">
									<span class="block truncate text-sm text-body">{event.winner ?? '—'}</span>
									<span class="block truncate text-[11px] text-muted">
										{#if event.showcase && event.showcase.rank === 1}
											{legendNames(event.showcase.legends)}
										{:else if event.showcase}
											deck shown: {event.showcase.name} ({event.showcase.rank})
										{:else}
											no deck
										{/if}
									</span>
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<ul class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
				{#each data.events as event (event.id)}
					<li>
						<a
							href="/meta/tournaments/{event.id}"
							class="group block overflow-hidden rounded-xl border border-edge bg-shell transition hover:border-neon-dim"
						>
							<div class="relative flex h-44 items-center justify-center bg-surface px-6">
								{#if event.showcase}
									{#each event.showcase.legends as slug, i (slug)}
										<LegendArt
											{slug}
											sizes="160px"
											class="w-24 shadow-xl transition duration-300 ease-out group-hover:-translate-y-2 motion-reduce:transition-none {HOVER_DELAY[
												i
											] ?? ''} {i === 0
												? '-rotate-6'
												: i === 2
													? 'rotate-6'
													: 'z-10 -mx-3 scale-110'}"
										/>
									{/each}
								{:else}
									<span class="font-mono text-xs text-muted">no decklists</span>
								{/if}
								<span class="absolute top-2 left-3 font-mono text-[11px] text-muted">
									{formatDate(event.startsAt)}
								</span>
								<span
									class="absolute top-2 right-3 rounded bg-void/70 px-1.5 py-0.5 font-mono text-[11px]"
								>
									{event.playerCount} players
								</span>
							</div>
							<div class="space-y-2 p-4">
								<h2 class="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-bright">
									{event.name}
								</h2>
								{#if event.showcase}
									<p class="text-xs text-muted">
										<span class="text-neon"
											>{event.showcase.rank === 1
												? '1st'
												: `Best deck: ${ordinal(event.showcase.rank)}`}</span
										>
										{event.showcase.name} · {legendNames(event.showcase.legends)}
									</p>
								{:else if event.winner}
									<p class="text-xs text-muted">
										<span class="text-neon">1st</span>
										{event.winner}
									</p>
								{/if}
								<div
									class="flex h-1.5 overflow-hidden rounded-full bg-edge"
									title="The field, by Legend colour"
								>
									{#each fieldByColour(event.field) as segment (segment.colour)}
										<span class={TINT[segment.colour]} style:width="{segment.width}%"></span>
									{/each}
								</div>
								<p class="font-mono text-[11px] text-muted">
									{#if event.kind !== 'Other'}<span class="text-neon">{event.kind}</span> ·
									{/if}{wherePlayed(event.organizer, event.venue)} · {event.roundCount} rounds · {event.deckCount}
									decks
								</p>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.pages > 1}
			<nav class="mt-6 flex items-center justify-between font-mono text-xs" aria-label="Pages">
				{#if data.page > 1}
					<a
						rel="nofollow"
						href={go(data.page - 1)}
						class="rounded border border-edge px-3 py-1.5 hover:text-bright">← Newer</a
					>
				{:else}
					<span></span>
				{/if}
				<span class="text-muted">Page {data.page} of {data.pages}</span>
				{#if data.page < data.pages}
					<a
						rel="nofollow"
						href={go(data.page + 1)}
						class="rounded border border-edge px-3 py-1.5 hover:text-bright">Older →</a
					>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	</div>
</div>
