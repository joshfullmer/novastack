<script lang="ts">
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';
	import { formatDate } from '#lib/tournaments/present.js';

	let { data, children } = $props();
	const event = $derived(data.event);

	const base = $derived(`/tournaments/${event.id}`);
	const views = $derived([
		{ href: base, label: 'Standings' },
		{ href: `${base}/podium`, label: 'Podium' },
		{ href: `${base}/rounds`, label: 'Rounds' }
	]);

	const description = $derived(
		`${event.name}: ${event.playerCount} players, ${event.rounds.length} rounds` +
			(event.deckCount > 0 ? `, ${event.deckCount} decklists.` : '.')
	);
</script>

<!-- `noindex` until the tournament pages launch (production has no tournament tables yet, and nothing links here). -->
<Meta
	title="{event.name} — novastack"
	{description}
	origin={data.origin}
	path={page.url.pathname}
	noindex
/>

<!-- The extra plain wrapper matters: `<main>` (root layout) is a column flex container, and a
     `mx-auto max-w-…` box that is a *direct* flex child has its stretch behaviour disabled. -->
<div>
	<div class="mx-auto w-full max-w-6xl px-4 py-8">
		<header class="border-b border-edge pb-4">
			<h1 class="text-2xl font-semibold text-bright">{event.name}</h1>
			<p class="mt-1 font-mono text-xs text-muted">
				{formatDate(event.startsAt)} · {event.organizer} · {event.playerCount} players · {event
					.rounds.length} rounds · {event.deckCount} decks ·
				<a
					href={event.meleeUrl}
					class="text-neon underline-offset-2 hover:underline"
					rel="noopener noreferrer"
					target="_blank">on Melee</a
				>
			</p>

			<nav class="mt-4 flex gap-1.5" aria-label="Views">
				{#each views as view (view.href)}
					<a
						href={view.href}
						aria-current={page.url.pathname === view.href ? 'page' : undefined}
						class="rounded-full border px-3 py-1 font-mono text-xs {page.url.pathname === view.href
							? 'border-neon bg-neon/10 text-bright'
							: 'border-edge text-muted hover:text-body'}"
					>
						{view.label}
					</a>
				{/each}
			</nav>
		</header>

		<div class="mt-6">{@render children()}</div>
	</div>
</div>
