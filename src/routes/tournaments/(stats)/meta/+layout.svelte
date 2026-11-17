<script lang="ts">
	import { periodParams } from '#lib/tournaments/period.js';
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';
	import { href } from '#lib/tournaments/url.js';

	let { data, children } = $props();

	const views = $derived([
		{ path: '/tournaments/meta', label: 'Tier list' },
		{ path: '/tournaments/meta/matchups', label: 'Matchups' },
		{ path: '/tournaments/meta/cards', label: 'Card breakdown' }
	]);
</script>

<!-- `noindex` until the tournament pages launch. -->
<Meta
	title="Tournament meta — novastack"
	description="What is being played in Cyberpunk TCG tournaments, and how it is doing."
	origin={data.origin}
	path={page.url.pathname}
	noindex
/>

<div>
	<div class="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
		<nav class="mb-6 flex gap-1.5" aria-label="Meta views">
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
		{@render children()}
	</div>
</div>
