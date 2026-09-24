<script lang="ts">
	/**
	 * PROTOTYPE — Variant A: "Collection first".
	 *
	 * Hierarchy bet: this feature is about **completion**. The Set checklist is the page; Binders
	 * and Wantlists are a strip you scroll past on the way to it. One surface, no navigation.
	 *
	 * Every stepper writes to the Collection — there is no "where does this go" decision anywhere,
	 * which is the flat model's main ergonomic win.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { normalizeForSearch } from '#lib/cards/dataset.js';
	import GoalEditor from './GoalEditor.svelte';
	import Stepper from './Stepper.svelte';
	import {
		adjust,
		binders,
		completion,
		filledPockets,
		inGoal,
		ownedCount,
		setProgress,
		slotsBySet,
		totalCopies,
		wantedCopies,
		wantlists
	} from './fake-collection.svelte.js';

	let search = $state('');
	let filter = $state<'all' | 'owned' | 'missing'>('all');
	/**
	 * Phrased as "Show all" rather than "Hide off-goal" so the default state is an **unchecked**
	 * box. A checkbox that ships checked reads as something already done to the list, which invites
	 * unchecking it to "see properly"; unchecked reads as an option you may opt into.
	 *
	 * This replaces a "Combine printings" toggle, which fought collector-number ordering:
	 * collapsing a Card's printings into one row destroys the printed sequence. Hiding Off Goal
	 * printings does most of the same work — the base set drops from 472 rows to 150 — and leaves
	 * the remaining 37 same-Set alt-art siblings sitting adjacent, which is how the run reads.
	 */
	let showAll = $state(false);

	const needle = $derived(normalizeForSearch(search));

	const visible = $derived(
		slotsBySet.map((group) => ({
			...group,
			rows: group.slots.filter((slot) => {
				if (!showAll && !inGoal(slot)) return false;
				if (needle && !normalizeForSearch(slot.card.name).includes(needle)) return false;
				const count = ownedCount(slot.printing.id);
				if (filter === 'owned') return count > 0;
				if (filter === 'missing') return count === 0;
				return true;
			})
		}))
	);

	const progress = $derived(completion());
</script>

<div class="mx-auto max-w-[1800px] p-6 sm:p-10">
	<div class="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<p class="text-sm font-medium tracking-widest text-neon-dim uppercase">Your collection</p>
			<h1 class="mt-1 text-5xl font-bold tracking-tight text-bright">Collection</h1>
			<p class="mt-2 text-muted">What you own, counted by printing. Private — always.</p>
		</div>

		<div class="flex shrink-0 items-end gap-8 rounded-xl border border-edge bg-shell px-7 py-5">
			<div>
				<p class="font-mono text-3xl text-bright tabular-nums">
					{progress.owned}<span class="text-lg text-muted">/{progress.total}</span>
				</p>
				<p class="mt-1 text-xs tracking-wide text-muted uppercase">In goal</p>
			</div>
			<div>
				<p class="font-mono text-3xl text-bright tabular-nums">{totalCopies()}</p>
				<p class="mt-1 text-xs tracking-wide text-muted uppercase">Copies</p>
			</div>
			<div>
				<p class="font-mono text-3xl text-neon tabular-nums">{progress.percent}%</p>
				<p class="mt-1 text-xs tracking-wide text-muted uppercase">Complete</p>
			</div>
		</div>
	</div>

	<!-- Binders and Wantlists as a passing strip: present, clearly secondary, not navigation. -->
	<div class="mb-8 flex flex-wrap gap-3">
		{#each binders as binder (binder.id)}
			<div class="rounded-lg border border-edge bg-shell px-4 py-3">
				<p class="text-sm text-body">
					{binder.name}
					{#if binder.visibility === 'shared'}<span class="ml-1 text-xs text-neon">◉</span>{/if}
				</p>
				<p class="mt-0.5 font-mono text-xs text-muted tabular-nums">
					{filledPockets(binder)} cards · {binder.pages.length} pages
				</p>
			</div>
		{/each}
		{#each wantlists as list (list.id)}
			<div class="rounded-lg border border-dashed border-edge px-4 py-3">
				<p class="text-sm text-muted">{list.name}</p>
				<p class="mt-0.5 font-mono text-xs text-muted/70 tabular-nums">
					{wantedCopies(list)} wanted
				</p>
			</div>
		{/each}
		<button
			class="rounded-lg border border-edge px-4 py-3 text-sm text-muted hover:border-neon-dim
				hover:text-neon">+ New binder</button
		>
	</div>

	<div class="mb-8">
		<GoalEditor />
	</div>

	<div
		class="sticky top-nav z-10 -mx-2 mb-8 flex flex-wrap items-center gap-3 bg-void/95 px-2 py-3
			backdrop-blur"
	>
		<input
			bind:value={search}
			placeholder="Search, or try owned:0 set:MS01-WNC"
			class="min-w-64 flex-1 rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm
				text-body placeholder:text-muted/60"
		/>
		<div class="flex overflow-hidden rounded-lg border border-edge">
			{#each ['all', 'owned', 'missing'] as const as option (option)}
				<button
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

	{#each visible as group (group.set.id)}
		{#if group.rows.length > 0}
			{@const setStats = setProgress(group.set.id)}
			<section class="mb-12">
				<!-- `total: 0` means nothing in this Set is In Goal — the Set still lists, but it has no
				     progress to report rather than a misleading 0%. -->
				<div
					class="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-l-2 pl-4
						{setStats.total === 0 ? 'border-edge' : 'border-neon'}"
				>
					<h2 class="text-2xl font-semibold {setStats.total === 0 ? 'text-muted' : 'text-bright'}">
						{group.set.name}
					</h2>
					<span class="font-mono text-sm text-muted">{group.set.printed}</span>
					{#if setStats.total === 0}
						<span class="ml-auto font-mono text-sm text-muted/60">off goal</span>
					{:else}
						<span class="ml-auto font-mono text-sm text-muted tabular-nums">
							{setStats.owned}/{setStats.total} collected
						</span>
						<div class="h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-surface">
							<div
								class="h-full rounded-full bg-neon"
								style="width: {(setStats.owned / setStats.total) * 100}%"
							></div>
						</div>
					{/if}
				</div>

				<div
					class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
				>
					{#each group.rows as slot (slot.printing.id)}
						{@const count = ownedCount(slot.printing.id)}
						<div class="relative">
							<div
								class="overflow-hidden rounded-lg transition-opacity"
								class:opacity-35={count === 0}
							>
								<CardImage
									printingId={slot.printing.id}
									thumbhash={slot.printing.thumbhash}
									color={slot.card.color}
									alt={slot.card.name}
									sizes="160px"
									class="rounded-lg"
								/>
							</div>
							{#if count === 0}
								<span
									class="pointer-events-none absolute top-1.5 left-1.5 rounded bg-void/90 px-1.5
										py-0.5 font-mono text-[0.6rem] tracking-wide text-muted uppercase">missing</span
								>
							{/if}
							<span
								class="pointer-events-none absolute top-1.5 right-1.5 rounded bg-void/90 px-1.5
										py-0.5 font-mono text-[0.6rem] text-muted tabular-nums">{slot.printing.collectorNumber}</span
							>
							<!-- Off Goal: uncounted, but still listed and still ownable. -->
							{#if !inGoal(slot)}
								<span
									class="pointer-events-none absolute inset-x-1.5 top-8 rounded bg-void/80 px-1 py-0.5
										text-center font-mono text-[0.55rem] tracking-wide text-muted uppercase">off goal</span
								>
							{/if}
							<div class="absolute inset-x-1 bottom-1">
								<Stepper {count} compact onAdjust={(delta) => adjust(slot.printing.id, delta)} />
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/each}
</div>
