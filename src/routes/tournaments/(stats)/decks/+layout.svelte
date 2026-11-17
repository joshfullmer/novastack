<script lang="ts">
	import { periodParams } from '#lib/tournaments/period.js';
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';
	import { href } from '#lib/tournaments/url.js';

	let { data, children } = $props();

	const views = [
		{ path: '/tournaments/decks', label: 'All decks' },
		{ path: '/tournaments/decks/lines', label: 'By Legend line' }
	];
</script>

<!-- `noindex` until the tournament pages launch. -->
<Meta
	title="Tournament decks — novastack"
	description="Decklists from Cyberpunk TCG tournaments."
	origin={data.origin}
	path={page.url.pathname}
	noindex
/>

<div>
	<div class="mx-auto w-full max-w-6xl px-4 py-6">
		<!-- The tabs are for the two list views; one deck's own page has its own way back. -->
		{#if views.some((view) => view.path === page.url.pathname)}
			<nav class="mb-6 flex gap-1.5" aria-label="Deck views">
				{#each views as view (view.path)}
					<a
						href={href(view.path, periodParams(data.period))}
						aria-current={page.url.pathname === view.path ? 'page' : undefined}
						class="rounded-full border px-3 py-1 font-mono text-xs {page.url.pathname === view.path
							? 'border-neon bg-neon/10 text-bright'
							: 'border-edge text-muted hover:text-body'}"
					>
						{view.label}
					</a>
				{/each}
			</nav>
		{/if}
		{@render children()}
	</div>
</div>
