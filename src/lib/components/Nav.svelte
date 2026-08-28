<script lang="ts">
	/**
	 * One shared nav in the root layout, so it cannot drift between routes.
	 *
	 * **Decks** graduated out of the dimmed placeholder list once the deckbuilder shipped
	 * (`docs/spec/deckbuilder.md`); **Sets** graduated the same way once `.scratch/sets-page/map.md`
	 * reached its destination.
	 *
	 * Set is a filter, not a route — `Sets` here is a stage-past-this-one landing page, not the
	 * Set facet.
	 *
	 * **Rules links out** to the community gameplay guide rather than sitting dimmed — there's no
	 * in-app rules page yet, but an external stopgap beats offering nothing. Swap for a real route
	 * once there's a comprehensive ruleset worth rendering ourselves.
	 *
	 * **Decks is a link with a hover dropdown** — `/decks` (My Decks, owner-only) and `/explore`
	 * (public, §9) are separate top-level routes, matching how every reference site (swudb,
	 * Piltover Archive, Moxfield) splits these rather than tabbing them on one page. Clicking
	 * "Decks" itself goes to My Decks; the dropdown is a shortcut straight to Explore.
	 */
	import { page } from '$app/state';
	import DiscordIcon from './DiscordIcon.svelte';
	import Mark from './Mark.svelte';

	const DISCORD_URL = 'https://discord.gg/TtTvVrMhz8';

	/** Measured rather than trusted to the `--spacing-nav` fallback in `layout.css` — the header's
	 * actual height shifts across breakpoints (e.g. the wordmark hiding below `sm`), and every
	 * sticky offset below it (`FilterBar`, `CardPane`) reads that same variable, so a stale
	 * static value would misalign all of them at once. */
	let height = $state(0);

	/** `/cards` pins its own query row instead (`FilterBar`'s `sticky top-nav`) — a phone browsing
	 * the grid gets that one persistent affordance, not two stacked bars eating the viewport. With
	 * the header unpinned there, `--spacing-nav` drops to 0 so `FilterBar` and `CardPane` — both of
	 * which read it as "how much sticky chrome sits above me" — settle at the true top on their
	 * own, no route check needed on their end. */
	const stickyHeader = $derived(page.url.pathname !== '/cards');

	$effect(() => {
		document.documentElement.style.setProperty('--spacing-nav', stickyHeader ? `${height}px` : '0px');
	});

	const LIVE = [{ href: '/cards', label: 'Cards' }];
	const DECKS = [
		{ href: '/decks', label: 'My Decks' },
		{ href: '/explore', label: 'Explore' }
	];

	const isCurrent = (href: string) => page.url.pathname.startsWith(href);
</script>

<header
	bind:clientHeight={height}
	class="z-30 border-b border-edge/60 bg-void/80 backdrop-blur-md {stickyHeader
		? 'sticky top-0'
		: ''}"
>
	<nav class="mx-auto flex max-w-[1800px] items-center gap-6 px-4 py-3 sm:px-6">
		<a href="/" class="flex items-center gap-2 text-lg font-semibold tracking-tight text-bright">
			<Mark class="size-5 shrink-0 text-neon" />
			<span class="hidden sm:inline">nova<span class="text-neon">stack</span></span>
		</a>

		<ul class="flex flex-1 items-center gap-4 text-sm">
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
				<a
					href="/decks"
					class="transition-colors hover:text-bright"
					class:text-bright={isCurrent('/decks') || isCurrent('/explore')}
					class:text-muted={!isCurrent('/decks') && !isCurrent('/explore')}
					aria-current={isCurrent('/decks') ? 'page' : undefined}
				>
					Decks
				</a>
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

			<li>
				<a
					href="/sets"
					class="transition-colors hover:text-bright"
					class:text-bright={isCurrent('/sets')}
					class:text-muted={!isCurrent('/sets')}
					aria-current={isCurrent('/sets') ? 'page' : undefined}>Sets</a
				>
			</li>

			<li>
				<a
					href="https://cyberpunktcg.com/comprehensive-rules"
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted transition-colors hover:text-bright">Rules</a
				>
			</li>
		</ul>

		<a
			href={DISCORD_URL}
			target="_blank"
			rel="noopener noreferrer"
			aria-label="Join the Discord server"
			class="text-muted transition-colors hover:text-bright"
		>
			<DiscordIcon class="size-5" />
		</a>

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
