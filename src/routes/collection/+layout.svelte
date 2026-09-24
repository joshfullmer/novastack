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

	let { children } = $props();

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

	const onGoal = $derived(page.url.pathname === '/collection/goal');
</script>

<div class="flex min-h-[calc(100vh-var(--spacing-nav))]">
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

		<!-- Dimmed placeholders rather than links that 404 — the treatment Nav used for Decks
		     before the deckbuilder shipped. -->
		<div class="space-y-4 border-t border-edge pt-5">
			{#each [{ label: 'Binders', note: 'Showcases of the cards you want to display' }, { label: 'Wantlists', note: 'What you are still looking for' }] as section (section.label)}
				<div>
					<p
						class="flex items-center gap-2 text-xs font-medium tracking-widest text-muted/50 uppercase"
					>
						{section.label}
						<span class="rounded bg-surface px-1.5 py-0.5 text-[0.6rem] tracking-normal normal-case"
							>soon</span
						>
					</p>
					<p class="mt-1 text-xs text-muted/40">{section.note}</p>
				</div>
			{/each}
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
		</div>
	</aside>

	<div class="min-w-0 flex-1 p-6 sm:p-9">{@render children()}</div>
</div>
