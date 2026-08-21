<script lang="ts">
	/**
	 * One shared nav in the root layout, so it cannot drift between routes.
	 *
	 * **Decks, Sets and Rules render as dimmed text with no `href`** — signalling direction
	 * without offering clickable 404s. `aria-disabled` alone would still be focusable and still
	 * navigate; omitting the href is what actually makes them inert.
	 *
	 * Set is a filter, not a route — `Sets` here is a stage-past-this-one landing page, not the
	 * Set facet.
	 */
	import { page } from '$app/state';
	import Mark from './Mark.svelte';

	const LIVE = [{ href: '/cards', label: 'Cards' }];
	const SOON = ['Decks', 'Sets', 'Rules'];

	const isCurrent = (href: string) => page.url.pathname.startsWith(href);
</script>

<header class="sticky top-0 z-30 border-b border-edge/60 bg-void/80 backdrop-blur-md">
	<nav class="mx-auto flex max-w-[1800px] items-baseline gap-6 px-4 py-3 sm:px-6">
		<a href="/" class="flex items-center gap-2 text-lg font-semibold tracking-tight text-bright">
			<Mark class="size-5 shrink-0 text-neon" />
			<span>nova<span class="text-neon">stack</span></span>
		</a>

		<ul class="flex items-baseline gap-4 text-sm">
			{#each LIVE as item (item.href)}
				<li>
					<a
						href={item.href}
						class="transition-colors hover:text-bright"
						class:text-bright={isCurrent(item.href)}
						class:text-muted={!isCurrent(item.href)}
						aria-current={isCurrent(item.href) ? 'page' : undefined}>{item.label}</a
					>
				</li>
			{/each}

			{#each SOON as label (label)}
				<li class="cursor-default text-muted/50 select-none">
					{label}<sup class="ml-0.5 text-[0.6em] tracking-wide text-neon-dim uppercase">soon</sup>
				</li>
			{/each}
		</ul>
	</nav>
</header>
