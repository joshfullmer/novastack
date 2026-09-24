<script lang="ts">
	/**
	 * `/collection` — the Collection's home.
	 *
	 * Shape taken from the prototype's winning variant (`collection-prototype/NOTES.md`, B):
	 * a persistent rail on the left, one working surface on the right. The **Collection is pinned
	 * at the top of the rail and styled unlike the named lists below it**, because it is singular,
	 * unnamed and unshareable while Binders and Wantlists are plural, named and shareable — the
	 * rail should not imply it is just another list.
	 *
	 * `self-start` on the rail is load-bearing: a flex item stretched to full height has nothing
	 * for `sticky` to stick to.
	 *
	 * **This slice ships the Collection view only.** Binders and Wantlists are later phases, and
	 * appear as dimmed placeholders — the same treatment Nav gave Decks before the deckbuilder
	 * shipped, rather than links that 404. The Collecting Goal is shown but not yet editable: the
	 * default (English retail, 332 of 700) is what every figure here is scoped to, and making it
	 * editable is the next piece of work.
	 */
	import { goto } from '$app/navigation';
	import { dataset } from '#lib/cards/index.js';
	import { collectorNumberSortKey } from '#lib/cards/derive.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import { currentUrl } from '#lib/filters/shallow.js';
	import { test } from '#lib/filters/predicate.js';
	import { PARAM, parseQueryState } from '#lib/filters/state.js';
	import QueryEditor from '#lib/components/filters/QueryEditor.svelte';
	import {
		DEFAULT_GOAL,
		completion,
		inGoal,
		rarityProgress,
		setProgress,
		totalCopies
	} from '#lib/collection/goal.js';
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import QuantityStepper from '#lib/components/QuantityStepper.svelte';

	let { data } = $props();

	let filter = $state<'all' | 'owned' | 'missing'>('all');
	/** See `/sets/[id]`: phrased so the default state is an unchecked box. */
	let showAll = $state(false);

	const goal = DEFAULT_GOAL;
	const ownedOf = (printingId: string) => collection.quantityOf(printingId);

	/**
	 * This page needs the Collection for its own figures, so it asks for it directly rather than
	 * leaning on `QuantityStepper`'s self-load. That net only fires when a stepper renders, and a
	 * query like `owned:yes` filters every tile out — which deadlocks: the query needs ownership
	 * data, the data would only arrive via a stepper, and no stepper survives the query. `load` is
	 * idempotent, so asking here costs nothing on top.
	 */
	$effect(() => void collection.load());

	/**
	 * The same query pipeline `/cards` uses — `QueryEditor` for syntax highlighting and
	 * autocomplete, `parseQueryState` for the parse, and `?q=` in the URL so a filtered view
	 * survives a reload and Back undoes a filter. Reusing it rather than keeping a plain substring
	 * box means `owned:0`, `rarity>=epic` and `set:` all work here for free.
	 *
	 * No `browser` guard, unlike `/cards`: that page is prerendered and so cannot touch
	 * `searchParams` at build time, whereas this one is `prerender = false` and can read the URL on
	 * the server too.
	 */
	const queryState = $derived(parseQueryState(currentUrl().searchParams, dataset));

	let queryTimer: ReturnType<typeof setTimeout> | undefined;

	function onSource(next: string) {
		// Debounced and history-replacing, matching `/cards`: one entry per pause in typing rather
		// than one per keystroke.
		clearTimeout(queryTimer);
		queryTimer = setTimeout(() => {
			const url = new URL(currentUrl().href);
			// An absent param, never an empty one — one canonical URL for "no query".
			if (next.trim() === '') url.searchParams.delete(PARAM.query);
			else url.searchParams.set(PARAM.query, next.trim());
			void goto(url, { shallow: true, replace: true });
		}, 200);
	}

	/**
	 * Every Printing, grouped by Set and ordered by printed Collector Number — the order the
	 * physical set is in, so it matches the cards in your hand and keeps a Card's printings
	 * adjacent. Off Goal printings stay in the list unless hidden: uncounted is not untracked.
	 */
	const groups = $derived(
		dataset.sets
			.map((set) => ({
				set,
				rows: dataset.cards
					.flatMap((card) => card.printings.map((printing) => ({ card, printing })))
					.filter((row) => row.printing.setId === set.id)
					.filter((row) => showAll || inGoal(row.printing, goal))
					// `test` per (card, printing) rather than `evaluate`, which returns one match per
					// Card with a witness printing. This grid lists Printings, so a printing-level
					// clause like `set:` or `rarity:` has to filter the rows themselves.
					.filter((row) => test(queryState.predicate, dataset, row.card, row.printing, ownedOf))
					.filter((row) => {
						const count = collection.quantityOf(row.printing.id);
						if (filter === 'owned') return count > 0;
						if (filter === 'missing') return count === 0;
						return true;
					})
					.sort((a, b) => {
						const [aNumber, aText] = collectorNumberSortKey(a.printing.collectorNumber);
						const [bNumber, bText] = collectorNumberSortKey(b.printing.collectorNumber);
						return aNumber - bNumber || aText.localeCompare(bText);
					})
			}))
			.filter((group) => group.rows.length > 0)
	);

	const progress = $derived(completion(dataset.cards, goal, ownedOf));

	const copies = $derived(totalCopies(dataset.cards, ownedOf));

	/**
	 * `1/332` rounds to 0%, which reads as "you have nothing" to someone who has just added their
	 * first card. `<1%` is the same number told honestly.
	 */
	const percentLabel = $derived(
		progress.owned > 0 && progress.percent === 0 ? '<1%' : `${progress.percent}%`
	);

	const copyLabel = $derived(`${copies} ${copies === 1 ? 'copy' : 'copies'}`);
	const rarities = $derived(rarityProgress(dataset.cards, dataset.rarities, goal, ownedOf));
</script>

<Meta
	title="Collection — novastack"
	description="What you own, counted by printing."
	origin={data.origin}
	path="/collection"
/>

<div class="flex min-h-[calc(100vh-var(--spacing-nav))]">
	<aside
		class="sticky top-nav hidden h-[calc(100vh-var(--spacing-nav))] w-72 shrink-0 flex-col gap-7
			self-start overflow-y-auto border-r border-edge bg-shell px-5 py-7 lg:flex"
	>
		<!-- Pinned, and deliberately not styled as a list item. -->
		<div class="rounded-xl border border-neon bg-neon/5 p-4">
			<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Collection</p>
			<p class="mt-2 font-mono text-2xl text-bright tabular-nums">
				{progress.owned}<span class="text-base text-muted">/{progress.total}</span>
			</p>
			<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
				<div class="h-full rounded-full bg-neon" style="width: {progress.percent}%"></div>
			</div>
			<p class="mt-2 text-xs text-muted tabular-nums">
				{percentLabel} complete · {copyLabel}
			</p>
		</div>

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
			<p class="text-xs font-medium tracking-widest text-muted uppercase">Collecting goal</p>
			<p class="mt-1.5 font-mono text-xs text-muted tabular-nums">
				{progress.total} of {dataset.stats.printings} printings counted
			</p>
			<p class="mt-1 text-xs text-muted/60">English retail, every set. Editing lands next.</p>
		</div>
	</aside>

	<div class="min-w-0 flex-1 p-6 sm:p-9">
		<div class="mb-6">
			<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Collection</p>
			<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">What you own</h1>
			<p class="mt-2 text-sm text-muted tabular-nums">
				{progress.owned} of {progress.total} printings · {copyLabel} · always private
			</p>
		</div>

		<div
			class="sticky top-nav z-10 -mx-2 mb-8 flex flex-wrap items-center gap-3 bg-void/95 px-2 py-3
				backdrop-blur"
		>
			<div class="min-w-56 flex-1">
				<QueryEditor
					id="collection-query"
					value={queryState.source}
					placeholder="Search, or write a query — try owned:0 rarity>=epic"
					warnings={queryState.warnings}
					{onSource}
				/>
			</div>
			<div class="flex overflow-hidden rounded-lg border border-edge">
				{#each ['all', 'owned', 'missing'] as const as option (option)}
					<button
						type="button"
						aria-pressed={filter === option}
						onclick={() => (filter = option)}
						class="px-4 py-2.5 text-sm capitalize {filter === option
							? 'bg-raised text-bright'
							: 'text-muted hover:text-body'}">{option}</button
					>
				{/each}
			</div>
			<label class="flex items-center gap-2 text-sm text-muted">
				<input type="checkbox" bind:checked={showAll} class="accent-neon" /> Show all
			</label>
		</div>

		{#if groups.length === 0}
			<p class="mt-16 text-center text-muted">Nothing matches those filters.</p>
		{/if}

		{#each groups as group (group.set.id)}
			{@const setStats = setProgress(dataset.cards, group.set.id, goal, ownedOf)}
			<section class="mb-10">
				<div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<h2 class="font-mono text-sm text-neon-dim">{group.set.printed}</h2>
					<span class="text-sm text-muted">{group.set.name}</span>
					{#if setStats.total === 0}
						<span class="ml-auto font-mono text-xs text-muted/60">off goal</span>
					{:else}
						<span class="ml-auto font-mono text-xs text-muted tabular-nums"
							>{setStats.owned}/{setStats.total}</span
						>
					{/if}
				</div>

				<ul
					class="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9"
				>
					{#each group.rows as row (row.printing.id)}
						{@const count = collection.quantityOf(row.printing.id)}
						<li class="group/tile relative">
							<div
								class="overflow-hidden rounded-lg transition-opacity"
								class:opacity-35={count === 0}
							>
								<CardImage
									printingId={row.printing.id}
									thumbhash={row.printing.thumbhash}
									color={row.card.color}
									alt={row.card.name}
									sizes="170px"
									class="rounded-lg"
								/>
							</div>
							<span
								class="pointer-events-none absolute top-1.5 right-1.5 rounded bg-void/90 px-1.5
									py-0.5 font-mono text-[0.6rem] text-muted tabular-nums">{row.printing.collectorNumber}</span
							>
							{#if !inGoal(row.printing, goal)}
								<span
									class="pointer-events-none absolute inset-x-1.5 top-8 rounded bg-void/80 px-1
										py-0.5 text-center font-mono text-[0.55rem] tracking-wide text-muted uppercase">off goal</span
								>
							{/if}
							<div class="pointer-events-none absolute bottom-1 left-1">
								<QuantityStepper printingId={row.printing.id} label={row.card.name} />
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>
