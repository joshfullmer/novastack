<script lang="ts">
	/**
	 * One shared nav in the root layout, so it cannot drift between routes.
	 *
	 * **Sets and Rules render as dimmed text with no `href`** — signalling direction without
	 * offering clickable 404s. `aria-disabled` alone would still be focusable and still navigate;
	 * omitting the href is what actually makes them inert. **Decks** graduated out of that list
	 * once the deckbuilder shipped (`docs/spec/deckbuilder.md`).
	 *
	 * Set is a filter, not a route — `Sets` here is a stage-past-this-one landing page, not the
	 * Set facet.
	 *
	 * **Decks is a hover dropdown**, not a direct link — `/decks` (My Decks, owner-only) and
	 * `/explore` (public, §9) are separate top-level routes, matching how every reference site
	 * (swudb, Piltover Archive, Moxfield) splits these rather than tabbing them on one page.
	 */
	import { page } from '$app/state';
	import Mark from './Mark.svelte';

	const LIVE = [{ href: '/cards', label: 'Cards' }];
	const DECKS = [
		{ href: '/decks', label: 'My Decks' },
		{ href: '/explore', label: 'Explore' }
	];
	const SOON = ['Sets', 'Rules'];

	const isCurrent = (href: string) => page.url.pathname.startsWith(href);
</script>

<header class="sticky top-0 z-30 border-b border-edge/60 bg-void/80 backdrop-blur-md">
	<nav class="mx-auto flex max-w-[1800px] items-baseline gap-6 px-4 py-3 sm:px-6">
		<a href="/" class="flex items-center gap-2 text-lg font-semibold tracking-tight text-bright">
			<Mark class="size-5 shrink-0 text-neon" />
			<span>nova<span class="text-neon">stack</span></span>
		</a>

		<ul class="flex flex-1 items-baseline gap-4 text-sm">
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

			<li class="group relative">
				<span
					class="cursor-default transition-colors hover:text-bright"
					class:text-bright={isCurrent('/decks') || isCurrent('/explore')}
					class:text-muted={!isCurrent('/decks') && !isCurrent('/explore')}
				>
					Decks
				</span>
				<ul
					class="invisible absolute top-full left-0 z-30 w-32 rounded-md border border-edge
						bg-shell p-1 text-sm opacity-0 shadow-lg transition-opacity group-focus-within:visible
						group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
				>
					{#each DECKS as item (item.href)}
						<li>
							<a
								href={item.href}
								class="block rounded px-2 py-1.5 hover:bg-raised"
								class:text-bright={isCurrent(item.href)}
								class:text-muted={!isCurrent(item.href)}
								aria-current={isCurrent(item.href) ? 'page' : undefined}>{item.label}</a
							>
						</li>
					{/each}
				</ul>
			</li>

			{#each SOON as label (label)}
				<li class="cursor-default text-muted/50 select-none">
					{label}<sup class="ml-0.5 text-[0.6em] tracking-wide text-neon-dim uppercase">soon</sup>
				</li>
			{/each}
		</ul>

		{#if page.data.user}
			<form method="POST" action="/auth/logout" class="text-sm">
				<button type="submit" class="text-muted transition-colors hover:text-bright"
					>Sign out</button
				>
			</form>
		{:else}
			<a href="/auth/login" class="text-sm text-muted transition-colors hover:text-bright"
				>Sign in</a
			>
		{/if}
	</nav>
</header>
