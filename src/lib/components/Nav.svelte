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
	 * **Rules is a link with a hover dropdown**, same shape as Decks below: the trigger goes
	 * straight to the comprehensive rules — the document players reach for by default, and the
	 * reason the trigger stays a link rather than an inert button. The dropdown adds the two
	 * secondary rules sources: the official tournament rules (organised play only, so it would
	 * be the wrong default) and `/faq`'s general rulings, the one rules-adjacent page this app
	 * renders itself. Both official documents are external until there's a ruleset worth
	 * rendering in-app.
	 *
	 * **Decks is a link with a hover dropdown** — `/decks` (My Decks, owner-only) and `/explore`
	 * (public, §9) are separate top-level routes, matching how every reference site (swudb,
	 * Piltover Archive, Moxfield) splits these rather than tabbing them on one page. Clicking
	 * "Decks" itself goes to My Decks; the dropdown is a shortcut straight to Explore.
	 *
	 * **The search box is the same `QueryEditor` `/cards` and `/` use** — syntax highlighting and
	 * autocomplete included, because they cost nothing here: both are dataset-free (`highlight.ts`
	 * walks the AST, `autocomplete.ts` the token stream), so a box in the shared layout doesn't
	 * drag 277 KB onto every route. Warnings are the syntax half only (`parse`, not `parseQuery`),
	 * for the same reason and with the same disclosed gap the landing page documents.
	 *
	 * **Cards is a link with a hover dropdown**, same shape as Decks and Rules: the trigger goes to the
	 * card database, and `Sets` sits under it. That made room for **Notation**, a top-level link of its
	 * own — it is for people who have not found the site yet as much as for ones who have, so it is not
	 * tucked into the Rules dropdown.
	 *
	 * Where it does *not* appear is the point of it:
	 *
	 * - **`/cards`** already pins `FilterBar`'s query row directly below this header, against the
	 *   same card pool. Two identical boxes 8px apart is a bug that looks like a feature.
	 * - **`/`** is a search box already, at hero size, autofocused.
	 * - **below `lg`**, where the link row is already at its limit — the box would have to steal
	 *   width from it, and the hamburger menu deliberately doesn't carry one either: `Cards` is one
	 *   tap away and lands on a page whose own query row is sticky.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { slide } from 'svelte/transition';
	import { cardsSearchHref, PARAM } from '#lib/filters/state.js';
	import { parse } from '#lib/query/parser.js';
	import QueryEditor from './filters/QueryEditor.svelte';
	import DiscordIcon from './DiscordIcon.svelte';
	import Mark from './Mark.svelte';

	const DISCORD_URL = 'https://discord.gg/TtTvVrMhz8';

	/** Measured rather than trusted to the `--spacing-nav` fallback in `layout.css` — the header's
	 * actual height shifts across breakpoints (e.g. the wordmark hiding below `sm`, the search box
	 * appearing at `lg`), and every sticky offset below it (`FilterBar`, `CardPane`) reads that same
	 * variable, so a stale static value would misalign all of them at once.
	 *
	 * `offsetHeight`, not `clientHeight`: the header carries a `border-b`, which `clientHeight`
	 * excludes. That put the variable a pixel under the space the header actually occupies — which
	 * a sticky offset can absorb invisibly, but not the shared Binder's fit, where it lands in a
	 * `100dvh` subtraction and the error shows up as an overflowing page. */
	let height = $state(0);

	/** `/cards` pins its own query row instead (`FilterBar`'s `sticky top-nav`) — a phone browsing
	 * the grid gets that one persistent affordance, not two stacked bars eating the viewport. With
	 * the header unpinned there, `--spacing-nav` drops to 0 so `FilterBar` and `CardPane` — both of
	 * which read it as "how much sticky chrome sits above me" — settle at the true top on their
	 * own, no route check needed on their end. */
	const stickyHeader = $derived(page.url.pathname !== '/cards');

	$effect(() => {
		document.documentElement.style.setProperty(
			'--spacing-nav',
			stickyHeader ? `${height}px` : '0px'
		);
	});

	/**
	 * Which half of the sign-in branch shows is decided pre-paint by `app.html` reading the
	 * `signed-in` hint cookie, because prerendered and edge-cached pages cannot carry per-user
	 * data at all (`#lib/server/signed-in-hint.ts`).
	 *
	 * On the three subtrees that *do* know — `/auth`, `/decks`, `/account` — `page.data.user` is
	 * authoritative and wins here. That matters for exactly one case: the hook corrects a stale
	 * cookie via `Set-Cookie` on the same response whose pre-paint script already read the old
	 * value, so without this the first render after a session expires would still say "Account".
	 */
	$effect(() => {
		const known = page.data.user;
		if (known === undefined) return;

		if (known) document.documentElement.dataset.signedIn = '';
		else delete document.documentElement.dataset.signedIn;
	});

	/**
	 * A hover dropdown that closes once one of its links is used.
	 *
	 * The menus open on `:hover` and `:focus-within`, both of which outlast a click: the pointer is still
	 * over the item, and the link keeps focus through a client-side navigation, so the menu would sit open
	 * over the page you just went to. A click on a link inside it blurs that link and sets `data-closed`,
	 * which the menu's `group-data-[closed]` classes hide it for; the pointer leaving, or focus coming
	 * back by keyboard, clears it again, so the next visit opens it as usual.
	 *
	 * A modified click (new tab, new window) does not navigate this page, so it leaves the menu alone.
	 */
	function dropdown(node: HTMLElement) {
		const close = (event: MouseEvent) => {
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			if (!(event.target as Element).closest('a')) return;
			(document.activeElement as HTMLElement | null)?.blur();
			node.dataset.closed = '';
		};
		const reopen = () => delete node.dataset.closed;
		node.addEventListener('click', close);
		node.addEventListener('pointerleave', reopen);
		node.addEventListener('focusin', reopen);
		return {
			destroy() {
				node.removeEventListener('click', close);
				node.removeEventListener('pointerleave', reopen);
				node.removeEventListener('focusin', reopen);
			}
		};
	}

	const CARDS = [
		{ href: '/cards', label: 'Browse' },
		{ href: '/sets', label: 'Sets' }
	];
	const DECKS = [
		{ href: '/decks', label: 'My Decks' },
		{ href: '/explore', label: 'Explore' }
	];
	const RULES_URL = 'https://cyberpunktcg.com/comprehensive-rules';
	const RULES = [
		{ href: RULES_URL, label: 'Comprehensive Rules', external: true },
		{
			href: 'https://cyberpunktcg.com/tournament-rules',
			label: 'Tournament Rules',
			external: true
		},
		{ href: '/faq', label: 'FAQ' }
	];

	const isCurrent = (href: string) => page.url.pathname.startsWith(href);

	const showSearch = $derived(page.url.pathname !== '/' && page.url.pathname !== '/cards');

	let searchQuery = $state('');
	const searchWarnings = $derived(parse(searchQuery).warnings);

	async function search(event: SubmitEvent) {
		event.preventDefault();
		await goto(cardsSearchHref(searchQuery));
		// Cleared once it has been spent: the text lives on in the URL and in `FilterBar`'s own box
		// from here, and this one is hidden on `/cards` anyway — leaving it filled would only mean
		// stale text reappearing on whatever page is visited next.
		searchQuery = '';
	}

	/**
	 * `/` focuses the page's search, the same accelerator GitHub, MDN and most docs sites share:
	 * the header box, or on `/cards` — where the header has none — `FilterBar`'s query row, which
	 * stands in for it. The two are never on screen together, so one selector covers both.
	 *
	 * There is no `showSearch` or breakpoint check: the box is simply absent (route) or
	 * `display: none` (below `lg`) when it isn't shown, and `focus()` refuses to land on either — so
	 * "focus took" is the visibility test, and the key is only swallowed when it did. The same
	 * property covers a modal `<dialog>` open over the page, which makes the header inert.
	 *
	 * Shift is deliberately not checked: on layouts where `/` is a shifted key (German, Nordic) the
	 * shortcut would otherwise never fire. `isComposing` keeps an IME's own `/` out of it.
	 */
	function focusSearchOnSlash(event: KeyboardEvent) {
		if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.defaultPrevented || event.isComposing) return;

		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || target.matches('input, textarea, select'))
		) {
			return;
		}

		const input = document.querySelector<HTMLElement>('#nav-query, #grid-query');
		input?.focus();
		// Keeps the `/` from being typed into the box it just focused.
		if (document.activeElement === input) event.preventDefault();
	}

	/** Below `sm` the full link row plus Discord/Account/Sign-out doesn't fit — it was overflowing
	 * the viewport outright (no wrapping, no shrinking anywhere) rather than degrading gracefully.
	 * Collapsed into a hamburger there instead of trying to cram it in. Also folds the desktop
	 * "Decks" and "Rules" items' hover dropdowns into flat links — hover has no touch equivalent,
	 * so Explore and FAQ were flat-out unreachable from this nav on a phone. */
	let mobileMenuOpen = $state(false);
	const closeMobileMenu = () => (mobileMenuOpen = false);

	$effect(() => {
		// `void` so the dependency-registering read isn't an unused expression (`pnpm lint`).
		void page.url.pathname;
		mobileMenuOpen = false;
	});
</script>

<svelte:window onkeydown={focusSearchOnSlash} />

<header
	bind:offsetHeight={height}
	class="z-30 border-b border-edge/60 bg-void/80 backdrop-blur-md {stickyHeader
		? 'sticky top-0'
		: ''}"
>
	<nav class="mx-auto flex max-w-[1800px] items-center gap-6 px-4 py-3 sm:px-6">
		<a href="/" class="flex items-center gap-2 text-lg font-semibold tracking-tight text-bright">
			<Mark class="size-5 shrink-0 text-neon" />
			<span class="hidden sm:inline">nova<span class="text-neon">stack</span></span>
		</a>

		<ul class="hidden flex-1 items-center gap-4 text-sm sm:flex">
			<li class="group relative" use:dropdown>
				<a
					href="/cards"
					class="transition-colors hover:text-bright"
					class:text-bright={isCurrent('/cards') || isCurrent('/sets')}
					class:text-muted={!isCurrent('/cards') && !isCurrent('/sets')}
					aria-current={page.url.pathname === '/cards' ? 'page' : undefined}
				>
					Cards
				</a>
				<ul
					class="invisible absolute top-full left-0 z-30 w-32 rounded-md border border-edge
						bg-shell p-1 text-sm opacity-0 shadow-lg transition-opacity group-focus-within:visible
						group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100
						group-data-[closed]:invisible! group-data-[closed]:opacity-0!"
				>
					{#each CARDS as item (item.href)}
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

			<li class="group relative" use:dropdown>
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
						group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100
						group-data-[closed]:invisible! group-data-[closed]:opacity-0!"
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
					href="/collection"
					class="transition-colors hover:text-bright"
					class:text-bright={isCurrent('/collection')}
					class:text-muted={!isCurrent('/collection')}
					aria-current={isCurrent('/collection') ? 'page' : undefined}>Collection</a
				>
			</li>

			<li>
				<a
					href="/notation"
					class="transition-colors hover:text-bright"
					class:text-bright={isCurrent('/notation')}
					class:text-muted={!isCurrent('/notation')}
					aria-current={isCurrent('/notation') ? 'page' : undefined}>Notation</a
				>
			</li>

			<li class="group relative" use:dropdown>
				<a
					href={RULES_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="transition-colors hover:text-bright"
					class:text-bright={isCurrent('/faq')}
					class:text-muted={!isCurrent('/faq')}
				>
					Rules
				</a>
				<ul
					class="invisible absolute top-full left-0 z-30 w-40 rounded-md border border-edge
						bg-shell p-1 text-sm opacity-0 shadow-lg transition-opacity group-focus-within:visible
						group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100
						group-data-[closed]:invisible! group-data-[closed]:opacity-0!"
				>
					{#each RULES as item (item.href)}
						<li>
							<a
								href={item.href}
								target={item.external ? '_blank' : undefined}
								rel={item.external ? 'noopener noreferrer' : undefined}
								class="block rounded px-2 py-1.5 hover:bg-raised"
								class:text-bright={!item.external && isCurrent(item.href)}
								class:text-muted={item.external || !isCurrent(item.href)}
								aria-current={!item.external && isCurrent(item.href) ? 'page' : undefined}
								>{item.label}</a
							>
						</li>
					{/each}
				</ul>
			</li>
		</ul>

		{#if showSearch}
			<!-- `lg:flex`, and `w-64` rather than `flex-1`: the link row above keeps `flex-1`, so the
				box stays a fixed size instead of ballooning on a wide screen. -->
			<form action="/cards" method="GET" onsubmit={search} class="hidden w-64 items-center lg:flex">
				<label for="nav-query" class="sr-only">Search cards</label>
				<!-- `QueryEditor`'s own input carries no `name` — see `/`'s copy of this pattern. -->
				<input type="hidden" name={PARAM.query} value={searchQuery} />
				<div class="group relative min-w-0 flex-1 text-sm">
					<QueryEditor
						id="nav-query"
						value={searchQuery}
						placeholder="Search cards…"
						warnings={searchWarnings}
						size="dense"
						onSource={(next) => (searchQuery = next)}
					/>
					<!-- The `/` shortcut's hint. Decorative (`aria-hidden`; the box has no use for it once a
						screen reader is already in it) and click-through, and gone the moment it stops being
						true — focused, or text in the way. -->
					{#if searchQuery === ''}
						<kbd
							aria-hidden="true"
							class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border
								border-edge px-1.5 font-mono text-xs leading-5 text-muted group-focus-within:hidden">/</kbd
						>
					{/if}
				</div>
			</form>
		{/if}

		<div class="hidden items-center gap-4 sm:flex">
			<a
				href={DISCORD_URL}
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Join the Discord server"
				class="text-muted transition-colors hover:text-bright"
			>
				<DiscordIcon class="size-5" />
			</a>

			<!-- Both halves always render; CSS picks one before first paint from the `signed-in`
			     hint cookie. See `layout.css` and `app.html`. -->
			<div class="contents" data-when-signed-in>
				<a
					href="/account"
					class="text-sm text-muted transition-colors hover:text-bright"
					class:text-bright={isCurrent('/account')}>Account</a
				>
				<form method="POST" action="/auth/logout" class="text-sm">
					<button type="submit" class="text-muted transition-colors hover:text-bright"
						>Sign out</button
					>
				</form>
			</div>
			<div class="contents" data-when-signed-out>
				<a href="/auth/login" class="text-sm text-muted transition-colors hover:text-bright"
					>Sign in</a
				>
			</div>
		</div>

		<button
			type="button"
			aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
			aria-expanded={mobileMenuOpen}
			aria-controls="mobile-nav-menu"
			onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
			class="ml-auto flex size-5 flex-col items-center justify-center gap-1 text-muted
				transition-colors hover:text-bright sm:hidden"
		>
			<span
				class="block h-0.5 w-5 rounded-full bg-current transition-transform duration-200"
				class:translate-y-1.5={mobileMenuOpen}
				class:rotate-45={mobileMenuOpen}
			></span>
			<span
				class="block h-0.5 w-5 rounded-full bg-current transition-opacity duration-200"
				class:opacity-0={mobileMenuOpen}
			></span>
			<span
				class="block h-0.5 w-5 rounded-full bg-current transition-transform duration-200"
				class:-translate-y-1.5={mobileMenuOpen}
				class:-rotate-45={mobileMenuOpen}
			></span>
		</button>
	</nav>

	{#if mobileMenuOpen}
		<div
			id="mobile-nav-menu"
			transition:slide={{ duration: 200 }}
			class="border-t border-edge/60 bg-void px-4 py-3 sm:hidden"
		>
			<ul class="flex flex-col gap-1 text-sm">
				{#each CARDS as item, index (item.href)}
					<li>
						<a
							href={item.href}
							onclick={closeMobileMenu}
							class="block rounded-md px-2 py-2 transition-colors hover:bg-raised"
							class:pl-6={index > 0}
							class:text-bright={isCurrent(item.href)}
							class:text-muted={!isCurrent(item.href)}
							aria-current={isCurrent(item.href) ? 'page' : undefined}>{item.label}</a
						>
					</li>
				{/each}
				{#each DECKS as item, index (item.href)}
					<li>
						<a
							href={item.href}
							onclick={closeMobileMenu}
							class="block rounded-md px-2 py-2 transition-colors hover:bg-raised"
							class:pl-6={index > 0}
							class:text-bright={isCurrent(item.href)}
							class:text-muted={!isCurrent(item.href)}
							aria-current={isCurrent(item.href) ? 'page' : undefined}>{item.label}</a
						>
					</li>
				{/each}
				<li>
					<a
						href="/collection"
						onclick={closeMobileMenu}
						class="block rounded-md px-2 py-2 transition-colors hover:bg-raised"
						class:text-bright={isCurrent('/collection')}
						class:text-muted={!isCurrent('/collection')}
						aria-current={isCurrent('/collection') ? 'page' : undefined}>Collection</a
					>
				</li>

				<li>
					<a
						href="/notation"
						onclick={closeMobileMenu}
						class="block rounded-md px-2 py-2 transition-colors hover:bg-raised"
						class:text-bright={isCurrent('/notation')}
						class:text-muted={!isCurrent('/notation')}
						aria-current={isCurrent('/notation') ? 'page' : undefined}>Notation</a
					>
				</li>
				{#each RULES as item, index (item.href)}
					<li>
						<a
							href={item.href}
							target={item.external ? '_blank' : undefined}
							rel={item.external ? 'noopener noreferrer' : undefined}
							onclick={closeMobileMenu}
							class="block rounded-md px-2 py-2 transition-colors hover:bg-raised"
							class:pl-6={index > 0}
							class:text-bright={!item.external && isCurrent(item.href)}
							class:text-muted={item.external || !isCurrent(item.href)}
							aria-current={!item.external && isCurrent(item.href) ? 'page' : undefined}
							>{item.label}</a
						>
					</li>
				{/each}
			</ul>

			<div class="mt-2 flex items-center gap-4 border-t border-edge/60 px-2 pt-3">
				<a
					href={DISCORD_URL}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Join the Discord server"
					onclick={closeMobileMenu}
					class="text-muted transition-colors hover:text-bright"
				>
					<DiscordIcon class="size-5" />
				</a>

				<div class="contents" data-when-signed-in>
					<a
						href="/account"
						onclick={closeMobileMenu}
						class="text-sm text-muted transition-colors hover:text-bright"
						class:text-bright={isCurrent('/account')}>Account</a
					>
					<form method="POST" action="/auth/logout" class="text-sm">
						<button type="submit" class="text-muted transition-colors hover:text-bright"
							>Sign out</button
						>
					</form>
				</div>
				<div class="contents" data-when-signed-out>
					<a
						href="/auth/login"
						onclick={closeMobileMenu}
						class="text-sm text-muted transition-colors hover:text-bright">Sign in</a
					>
				</div>
			</div>
		</div>
	{/if}
</header>
