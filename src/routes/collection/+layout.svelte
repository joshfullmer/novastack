<script lang="ts">
	/**
	 * The `/collection` shell — the rail, shared by every pane beneath it.
	 *
	 * Shape from the prototype's winning variant (`collection-prototype/NOTES.md`, B): a persistent
	 * rail on the left, one working surface on the right. The **Collection is pinned at the top and
	 * styled unlike the entries below it**, because it is singular, unnamed and unshareable while
	 * Binders and Wantlists are plural, named and shareable — the rail should not imply it is just
	 * another list.
	 *
	 * **The rail navigates; it does not toggle.** Each pane is a real route, so the entries are
	 * links: deep-linkable, correct under Back, and openable in a new tab or with a middle click.
	 * An earlier version switched panes with a client-side `view` variable, which bought nothing and
	 * cost all three.
	 *
	 * `self-start` is load-bearing: a flex item stretched to full height has nothing for `sticky` to
	 * stick to.
	 */
	import { page } from '$app/state';
	import { dataset } from '#lib/cards/index.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import { completion, rarityProgress, totalCopies } from '#lib/collection/goal.js';

	let { children, data } = $props();

	/**
	 * Loaded here rather than per-pane: every pane's figures depend on it, and the rail's own do
	 * too. `load` is a one-shot no-op, so asking once at the shell is both sufficient and cheapest.
	 */
	$effect(() => void collection.load());

	const goal = $derived(collection.goal);
	const ownedOf = (printingId: string) => collection.quantityOf(printingId);

	const progress = $derived(completion(dataset.cards, goal, ownedOf));
	const copies = $derived(totalCopies(dataset.cards, ownedOf));
	const rarities = $derived(rarityProgress(dataset.cards, dataset.rarities, goal, ownedOf));

	/** `1/332` rounds to 0%, which reads as "you have nothing" to someone who has just added their
	 * first card. `<1%` is the same number told honestly. */
	const percentLabel = $derived(
		progress.owned > 0 && progress.percent === 0 ? '<1%' : `${progress.percent}%`
	);
	const copyLabel = $derived(`${copies} ${copies === 1 ? 'copy' : 'copies'}`);

	const path = $derived(page.url.pathname);
	const onGoal = $derived(path === '/collection/goal');
	const onAdd = $derived(path === '/collection/add');
	const onBinders = $derived(path === '/collection/binders');
	const onWantlists = $derived(path === '/collection/wantlists');
</script>

<div class="flex min-h-[calc(100vh-var(--spacing-nav))]">
	<!-- No rail for a stranger following a shared Binder or Wantlist link: every figure in it is about a
	     Collection they don't have. They still get this layout, so the page inside it doesn't have to
	     know whether it's being read by its owner. -->
	{#if data.user}
		<aside
			class="sticky top-nav hidden h-[calc(100vh-var(--spacing-nav))] w-72 shrink-0 flex-col gap-7
			self-start overflow-y-auto border-r border-edge bg-shell px-5 py-7 lg:flex"
		>
			<!-- Pinned, and deliberately not styled as a list entry. A link rather than plain text so
		     it's the way back from any other pane. -->
			<a
				href="/collection"
				class="block rounded-xl border p-4 transition-colors {onGoal
					? 'border-edge hover:border-neon-dim'
					: 'border-neon bg-neon/5'}"
			>
				<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Collection</p>
				<p class="mt-2 font-mono text-2xl text-bright tabular-nums">
					{progress.owned}<span class="text-base text-muted">/{progress.total}</span>
				</p>
				<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
					<div class="h-full rounded-full bg-neon" style="width: {progress.percent}%"></div>
				</div>
				<p class="mt-2 text-xs text-muted tabular-nums">{percentLabel} complete · {copyLabel}</p>
			</a>

			<a
				href="/collection/add"
				aria-current={onAdd ? 'page' : undefined}
				class="group/add flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm
				transition-colors {onAdd
					? 'border-neon bg-neon/5 text-neon'
					: 'border-edge text-body hover:border-neon-dim hover:bg-surface'}"
			>
				<span class="font-medium">Add cards</span>
				<span class="text-xs text-muted">rapid entry</span>
				<span
					class="ml-auto text-xs transition-transform {onAdd
						? 'text-neon'
						: 'text-muted/60 group-hover/add:translate-x-0.5 group-hover/add:text-neon'}"
					aria-hidden="true">›</span
				>
			</a>

			<div>
				<p class="mb-2 text-xs font-medium tracking-widest text-muted uppercase">By rarity</p>
				<ul class="space-y-2.5">
					{#each rarities as row (row.rarity)}
						<li>
							<div class="mb-1 flex items-baseline justify-between gap-2 text-sm">
								<span class="min-w-0 truncate text-body">{row.rarity}</span>
								<span class="shrink-0 font-mono text-xs text-muted tabular-nums"
									>{row.owned}/{row.total}</span
								>
							</div>
							<div class="h-1 overflow-hidden rounded-full bg-surface">
								<div class="h-full rounded-full bg-neon-dim" style="width: {row.percent}%"></div>
							</div>
						</li>
					{/each}
				</ul>
			</div>

			<div class="space-y-4 border-t border-edge pt-5">
				<div>
					<!-- The link *is* the header row, count included, rather than wrapping the word alone:
					     a section heading that's only clickable across eight characters is a target you
					     have to aim at. -->
					<a
						href="/collection/binders"
						aria-current={onBinders ? 'page' : undefined}
						class="mb-2 flex items-baseline gap-2 rounded px-2 py-1 text-xs font-medium
							tracking-widest uppercase transition-colors {onBinders
							? 'text-neon'
							: 'text-muted hover:bg-surface hover:text-body'}"
					>
						<span>Binders</span>
						<span class="ml-auto font-mono tracking-normal text-muted/50 normal-case tabular-nums"
							>{data.binders.length}</span
						>
					</a>

					{#if data.binders.length === 0}
						<p class="px-2 text-xs text-muted/50">Showcases of the cards you want to display</p>
					{:else}
						<ul class="space-y-0.5">
							<!-- Capped, with the overflow behind the section link: the rail is a way in, not an
						     index, and a user with thirty binders would push the goal off the screen. -->
							{#each data.binders.slice(0, 5) as binder (binder.id)}
								<li>
									<!-- No `aria-current`: the rail only renders under `/collection`, so a Binder's
								     own page never shows it and there is no current entry to mark. -->
									<a
										href="/collection/binders/{binder.id}"
										class="flex items-baseline gap-2 rounded px-2 py-1 text-sm text-body
										transition-colors hover:bg-surface hover:text-neon"
									>
										<span class="min-w-0 truncate">{binder.name}</span>
										{#if binder.visibility === 'shared'}
											<span class="shrink-0 text-[0.6rem] text-muted/60">shared</span>
										{/if}
										<span class="ml-auto shrink-0 font-mono text-xs text-muted/60 tabular-nums"
											>{binder.filled}</span
										>
									</a>
								</li>
							{/each}
						</ul>
						{#if data.binders.length > 5}
							<a
								href="/collection/binders"
								class="mt-1 block px-2 text-xs text-muted hover:text-neon"
								>{data.binders.length - 5} more…</a
							>
						{/if}
					{/if}
				</div>

				<div>
					<a
						href="/collection/wantlists"
						aria-current={onWantlists ? 'page' : undefined}
						class="mb-2 flex items-baseline gap-2 rounded px-2 py-1 text-xs font-medium
							tracking-widest uppercase transition-colors {onWantlists
							? 'text-neon'
							: 'text-muted hover:bg-surface hover:text-body'}"
					>
						<span>Wantlists</span>
						<span class="ml-auto font-mono tracking-normal text-muted/50 normal-case tabular-nums"
							>{data.wantlists.length}</span
						>
					</a>

					{#if data.wantlists.length === 0}
						<p class="px-2 text-xs text-muted/50">What you are still looking for</p>
					{:else}
						<ul class="space-y-0.5">
							<!-- Capped like the Binders above, for the same reason. -->
							{#each data.wantlists.slice(0, 5) as wantlist (wantlist.id)}
								<li>
									<a
										href="/collection/wantlists/{wantlist.id}"
										class="flex items-baseline gap-2 rounded px-2 py-1 text-sm text-body
											transition-colors hover:bg-surface hover:text-neon"
									>
										<span class="min-w-0 truncate">{wantlist.name}</span>
										{#if wantlist.visibility === 'shared'}
											<span class="shrink-0 text-[0.6rem] text-muted/60">shared</span>
										{/if}
										<!-- Copies, not distinct cards: on a Wantlist the number that matters is how
										     many you're asking for. -->
										<span class="ml-auto shrink-0 font-mono text-xs text-muted/60 tabular-nums"
											>{wantlist.copies}</span
										>
									</a>
								</li>
							{/each}
						</ul>
						{#if data.wantlists.length > 5}
							<a
								href="/collection/wantlists"
								class="mt-1 block px-2 text-xs text-muted hover:text-neon"
								>{data.wantlists.length - 5} more…</a
							>
						{/if}
					{/if}
				</div>
			</div>

			<div class="mt-auto border-t border-edge pt-5">
				<!-- Given a bordered surface and a chevron rather than left as bare text: it sits where a
			     static label used to, so without an affordance it reads as a caption rather than the
			     entry point to a pane. -->
				<a
					href="/collection/goal"
					aria-current={onGoal ? 'page' : undefined}
					class="group/goal block rounded-lg border px-3 py-2.5 transition-colors {onGoal
						? 'border-neon bg-neon/5'
						: 'border-edge hover:border-neon-dim hover:bg-surface'}"
				>
					<span class="flex items-center gap-2">
						<span
							class="text-xs font-medium tracking-widest uppercase transition-colors {onGoal
								? 'text-neon'
								: 'text-muted group-hover/goal:text-body'}">Collecting goal</span
						>
						<span
							class="ml-auto text-xs transition-transform {onGoal
								? 'text-neon'
								: 'text-muted/60 group-hover/goal:translate-x-0.5 group-hover/goal:text-neon'}"
							aria-hidden="true">›</span
						>
					</span>
					<span
						class="mt-1 block font-mono text-xs tabular-nums {onGoal ? 'text-body' : 'text-muted'}"
					>
						{progress.total} of {dataset.stats.printings} printings counted
					</span>
					<span class="mt-0.5 block text-xs text-muted/60">
						{collection.goalIsDefault ? 'Default — tap to choose' : 'Customised'}
					</span>
				</a>

				<a
					href="/api/collection/export"
					download
					class="mt-2 block rounded-lg px-3 py-2 text-xs text-muted transition-colors
					hover:bg-surface hover:text-neon"
				>
					Export CSV
					<span class="mt-0.5 block text-muted/50">Everything you own, re-importable</span>
				</a>
			</div>
		</aside>
	{/if}

	<div class="min-w-0 flex-1 p-6 sm:p-9">{@render children()}</div>
</div>
