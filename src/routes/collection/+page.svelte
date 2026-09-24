<script lang="ts">
	/**
	 * `/collection` — the Collection view. The rail lives in `+layout.svelte`.
	 *
	 * **Every control here is a link.** The ownership pills and "Show all" change nothing but the
	 * URL, so they are `<a href>` rather than buttons: middle-click, open-in-new-tab, Back as
	 * filter-undo, and a copyable address all come free, and there is no second source of truth to
	 * drift. Only the query box stays programmatic, because typing has no single destination until
	 * you stop.
	 *
	 * The cost is a client-side navigation per click, which re-runs the layout's server load — a
	 * session check. That is a fair price here, unlike on `/cards`, where the page is prerendered
	 * and shallow routing keeps filter changes entirely client-side.
	 *
	 * Ownership arrives from `#lib/collection/state.svelte.ts` rather than from a `load`, so the
	 * store stays the single source of truth across every surface; a server-rendered count would
	 * disagree with the steppers the moment one was clicked.
	 */
	import { goto } from '$app/navigation';
	import { dataset } from '#lib/cards/index.js';
	import { collectorNumberSortKey } from '#lib/cards/derive.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import { currentUrl } from '#lib/filters/shallow.js';
	import { test, type Predicate } from '#lib/filters/predicate.js';
	import { PARAM, parseQueryState } from '#lib/filters/state.js';
	import { withFacetEdit } from '#lib/filters/query-edit.js';
	import { inGoal, setProgress } from '#lib/collection/goal.js';
	import { SvelteSet } from 'svelte/reactivity';
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import QuantityStepper from '#lib/components/QuantityStepper.svelte';
	import QueryEditor from '#lib/components/filters/QueryEditor.svelte';

	let { data } = $props();

	/**
	 * Off Goal printings are hidden unless asked for. In the URL rather than local state, so the
	 * control can be a link and the view survives a reload — and phrased as "show all" so its
	 * default is the *absent* param, matching the printing chooser and the set page's tabs.
	 */
	const ALL_PARAM = 'all';

	const goal = $derived(collection.goal);
	const ownedOf = (printingId: string) => collection.quantityOf(printingId);

	const showAll = $derived(currentUrl().searchParams.has(ALL_PARAM));

	/**
	 * The same query pipeline `/cards` uses — `QueryEditor` for highlighting and autocomplete,
	 * `parseQueryState` for the parse. Reusing it rather than keeping a plain substring box means
	 * `owned:0`, `rarity>=epic` and `set:` all work here.
	 *
	 * No `browser` guard, unlike `/cards`: that page is prerendered and so cannot touch
	 * `searchParams` at build time, whereas this subtree is `prerender = false`.
	 */
	const queryState = $derived(parseQueryState(currentUrl().searchParams, dataset));

	/** A URL with some params changed and everything else — including `?q=` — left alone. */
	function urlWith(changes: { q?: string; all?: boolean }): string {
		const url = new URL(currentUrl().href);

		if (changes.q !== undefined) {
			// An absent param, never an empty one: one canonical URL for "no query".
			if (changes.q.trim() === '') url.searchParams.delete(PARAM.query);
			else url.searchParams.set(PARAM.query, changes.q.trim());
		}
		if (changes.all !== undefined) {
			if (changes.all) url.searchParams.set(ALL_PARAM, '1');
			else url.searchParams.delete(ALL_PARAM);
		}

		return `${url.pathname}${url.search}`;
	}

	/**
	 * The All/Owned/Missing control **is** the query — the same contract chips have on `/cards`
	 * (query-language spec §9). Each pill's href is the query it would produce, and the current
	 * state is read back out of the compiled predicate, so typing `owned:0` by hand lights
	 * "Missing".
	 *
	 * `null` is a real fourth state: `owned<4` is a genuine ownership filter none of the three
	 * represents, so none of them claims it. Lighting "All" there would be a lie.
	 */
	const ownedFilter = $derived.by((): 'all' | 'owned' | 'missing' | null => {
		const leaves = ownedLeaves(queryState.predicate);
		if (leaves.length === 0) return 'all';
		if (leaves.length > 1) return null;

		const [leaf] = leaves;
		if (leaf.min === 1 && leaf.max === null) return 'owned';
		if (leaf.min === 0 && leaf.max === 0) return 'missing';
		return null;
	});

	function ownedLeaves(predicate: Predicate): Extract<Predicate, { kind: 'numeric' }>[] {
		switch (predicate.kind) {
			case 'and':
			case 'or':
				return predicate.children.flatMap(ownedLeaves);
			case 'not':
				return ownedLeaves(predicate.child);
			case 'numeric':
				return predicate.field === 'owned' ? [predicate] : [];
			default:
				return [];
		}
	}

	function ownedFilterHref(state: 'all' | 'owned' | 'missing'): string {
		// Span-based, so it rewrites only ownership's own clause and leaves the rest of the query.
		return urlWith({ q: withFacetEdit(queryState.source, dataset, { facet: 'owned', state }) });
	}

	let queryTimer: ReturnType<typeof setTimeout> | undefined;

	function onSource(next: string) {
		// Debounced and history-replacing, matching `/cards`: one entry per pause in typing rather
		// than one per keystroke. The pills push instead, so Back undoes a filter.
		clearTimeout(queryTimer);
		queryTimer = setTimeout(() => void goto(urlWith({ q: next }), { replaceState: true }), 200);
	}

	/**
	 * Every Printing, grouped by Set and ordered by printed Collector Number — the order the
	 * physical set is in, so it matches the cards in your hand and keeps a Card's printings
	 * adjacent. Off Goal printings stay listed unless hidden: uncounted is not untracked.
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
					.sort((a, b) => {
						const [aNumber, aText] = collectorNumberSortKey(a.printing.collectorNumber);
						const [bNumber, bText] = collectorNumberSortKey(b.printing.collectorNumber);
						return aNumber - bNumber || aText.localeCompare(bText);
					})
			}))
			.filter((group) => group.rows.length > 0)
	);

	const shown = $derived(groups.reduce((sum, group) => sum + group.rows.length, 0));

	/**
	 * "Add all missing" per Set, over **what is currently shown** rather than the whole Set — so it
	 * composes with the query and the goal instead of quietly ignoring them. A button rather than a
	 * link, unlike the filters: this one changes data, and a link that mutates on GET is the thing
	 * you are not supposed to build.
	 */
	function addAllMissing(printingIds: readonly string[]) {
		const missing = printingIds.filter((id) => collection.quantityOf(id) === 0);
		if (missing.length === 0) return;
		void collection.setMany(new Map(missing.map((id) => [id, 1])));
	}

	// ---------------------------------------------------------------------------------------------
	// Wanting

	/**
	 * What's already on the Wantlist: the server's list, plus anything added since.
	 *
	 * The two are kept separate and merged rather than seeding one set from `data`, so a later
	 * invalidation can't drop this session's additions — and the derived union means no stale
	 * snapshot of `data` either. Local rather than re-invalidating per click: a want is a small,
	 * certain write, and re-running the load would re-render a 332-tile grid to learn one thing it
	 * was just told.
	 */
	const addedToWantlist = new SvelteSet<string>();
	const wanted = $derived(new SvelteSet([...data.wanted, ...addedToWantlist]));
	let wantFailed = $state(false);

	/**
	 * Adds copies to the default Wantlist, or fails visibly.
	 *
	 * Optimistic, and **not** rolled back on failure: an error here means the list may or may not
	 * have the card, and quietly un-marking it would claim more than we know. The message says to
	 * reload, which is the one action that can tell the truth.
	 */
	async function want(printingIds: readonly string[]) {
		const wantlist = data.wantlist;
		if (!wantlist) return;

		const items = printingIds
			.filter((id) => !wanted.has(id))
			.map((printingId) => ({ printingId, quantity: 1 }));
		if (items.length === 0) return;

		for (const item of items) addedToWantlist.add(item.printingId);
		wantFailed = false;

		try {
			const response = await fetch('/api/collection/wantlists', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ wantlistId: wantlist.id, items })
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
		} catch {
			wantFailed = true;
		}
	}

	/** Missing *and* not already wanted, among what the current query shows. */
	const wantableShown = $derived(
		groups.flatMap((group) =>
			group.rows
				.map((row) => row.printing.id)
				.filter((id) => collection.quantityOf(id) === 0 && !wanted.has(id))
		)
	);
</script>

<Meta
	title="Collection — novastack"
	description="What you own, counted by printing."
	origin={data.origin}
	path="/collection"
/>

<div class="mb-6">
	<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Collection</p>
	<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">What you own</h1>
	<p class="mt-2 text-sm text-muted tabular-nums">
		{shown} printings shown · always private
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
			<a
				href={ownedFilterHref(option)}
				aria-current={ownedFilter === option ? 'true' : undefined}
				class="px-4 py-2.5 text-sm capitalize transition-colors {ownedFilter === option
					? 'bg-raised text-bright'
					: 'text-muted hover:text-body'}">{option}</a
			>
		{/each}
	</div>

	<a
		href={urlWith({ all: !showAll })}
		aria-current={showAll ? 'true' : undefined}
		title={showAll ? 'Hide printings outside your collecting goal' : 'Include off-goal printings'}
		class="rounded-lg border px-4 py-2.5 text-sm transition-colors {showAll
			? 'border-neon bg-neon/10 text-neon'
			: 'border-edge text-muted hover:border-neon-dim hover:text-body'}">Show all</a
	>
</div>

<!--
	Where "want" goes, said once at the top rather than implied by every tile's button. A collector
	filtering to `owned:0 rarity>=epic` and then wanting the lot needs to know which list they're
	filling, and the bulk action is right next to the query that defines "the lot".
-->
{#if collection.editable}
	<div class="-mt-4 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
		{#if data.wantlist}
			<span>
				Wants go to
				<a href="/collection/wantlists/{data.wantlist.id}" class="text-body hover:text-neon"
					>{data.wantlist.name}</a
				>
			</span>

			{#if wantableShown.length > 0}
				<button
					type="button"
					onclick={() => void want(wantableShown)}
					class="rounded-full border border-edge px-2.5 py-0.5 transition-colors
						hover:border-neon-dim hover:text-neon">Want {wantableShown.length} missing shown</button
				>
			{/if}

			<a href="/collection/wantlists" class="text-muted/70 hover:text-neon">Change</a>
		{:else}
			<span>
				<a href="/collection/wantlists" class="text-body hover:text-neon">Start a wantlist</a>
				to mark cards you're hunting for from here.
			</span>
		{/if}

		{#if wantFailed}
			<!-- Deliberately not self-clearing, and not rolled back: after a failed write the list may
			     or may not have the card, and only a reload can say. -->
			<span class="text-card-red">Couldn't reach the wantlist — reload to see where it got to.</span
			>
		{/if}
	</div>
{/if}

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

			{#if collection.editable}
				{@const missing = group.rows.filter((row) => collection.quantityOf(row.printing.id) === 0)}
				{#if missing.length > 0}
					<button
						type="button"
						onclick={() => addAllMissing(group.rows.map((row) => row.printing.id))}
						class="rounded-full border border-edge px-2.5 py-0.5 text-xs text-muted
							transition-colors hover:border-neon-dim hover:text-neon">Add {missing.length} missing (1×)</button
					>
				{/if}
			{/if}
		</div>

		<ul class="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9">
			{#each group.rows as row (row.printing.id)}
				{@const count = collection.quantityOf(row.printing.id)}
				<li class="group/tile relative">
					<!-- Veiled rather than dimmed when you own none: see `card-veil` in `layout.css`. -->
					<div class="overflow-hidden rounded-lg" class:card-veil={count === 0}>
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
						class="pointer-events-none absolute top-1.5 right-1.5 rounded bg-void/90 px-1.5 py-0.5
							font-mono text-[0.6rem] text-muted tabular-nums">{row.printing.collectorNumber}</span
					>
					{#if !inGoal(row.printing, goal)}
						<span
							class="pointer-events-none absolute inset-x-1.5 top-8 rounded bg-void/80 px-1 py-0.5
								text-center font-mono text-[0.55rem] tracking-wide text-muted uppercase">off goal</span
						>
					{/if}
					<div class="pointer-events-none absolute bottom-1 left-1">
						<QuantityStepper printingId={row.printing.id} label={row.card.name} />
					</div>

					{#if collection.editable && data.wantlist}
						{@const onList = wanted.has(row.printing.id)}
						<!--
							Bottom-right, opposite the stepper, and hidden until hover unless it's already
							wanted — the same restraint the stepper learned: a control on every one of 332
							tiles has to earn its ink. Once on the list the marker stays visible, because
							that's a fact about the card rather than an action you might take.
						-->
						<button
							type="button"
							onclick={() => void want([row.printing.id])}
							disabled={onList}
							aria-label={onList
								? `${row.card.name} is on your wantlist`
								: `Add ${row.card.name} to your wantlist`}
							title={onList ? 'On your wantlist' : 'Add to wantlist'}
							class="absolute right-1 bottom-1 grid size-5 place-items-center rounded border
								text-[0.6rem] transition-opacity {onList
								? 'border-neon/60 bg-void/90 text-neon opacity-100'
								: 'border-edge bg-void/90 text-muted opacity-0 group-hover/tile:opacity-100 hover:border-neon-dim hover:text-neon focus-visible:opacity-100'}"
							>{onList ? '★' : '☆'}</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/each}
