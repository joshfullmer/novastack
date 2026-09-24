<script lang="ts">
	/**
	 * PROTOTYPE — Variant B: "Three peers in a rail".
	 *
	 * Hierarchy bet: Collection, Binders and Wantlists are **peers**, reached from one persistent
	 * left rail, and the right pane changes shape to match whichever you picked — a checklist for
	 * the Collection, a Page of Pockets for a Binder, a want list for a Wantlist.
	 *
	 * The Collection is pinned at the top of the rail and styled unlike the rest, because it is
	 * singular, unnamed and unshareable while everything below it is plural, named and shareable.
	 * That visual asymmetry is the point: the rail should not imply the Collection is "just
	 * another list".
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { normalizeForSearch } from '#lib/cards/dataset.js';
	import GoalEditor from './GoalEditor.svelte';
	import PocketSpread from './PocketSpread.svelte';
	import Stepper from './Stepper.svelte';
	import {
		addBinder,
		addPage,
		adjust,
		adjustWant,
		binders,
		completion,
		distinctOwned,
		inGoal,
		filledPockets,
		goalSlots,
		nextFreePocket,
		ownedCount,
		place,
		removePage,
		setProgress,
		slotByPrintingId,
		slots,
		slotsBySet,
		totalCopies,
		totalPockets,
		wantedCopies,
		wantlists
	} from './fake-collection.svelte.js';

	type Selection =
		| { kind: 'collection' }
		| { kind: 'goal' }
		| { kind: 'binder'; id: string }
		| { kind: 'wantlist'; id: string };

	let selection = $state<Selection>({ kind: 'collection' });
	let search = $state('');
	let filter = $state<'all' | 'owned' | 'missing'>('all');
	/** "Show all" rather than "Hide off-goal", so the default state is an **unchecked** box: a
	 * checkbox that ships checked reads as something already done to the list. */
	let showAll = $state(false);

	// Binder pane state.
	let pageIndex = $state(0);
	let selectedPocket = $state<number | null>(null);
	let paletteSearch = $state('');

	// Bound to a local first: TypeScript can't narrow a `$state` read across the closure boundary.
	const binder = $derived.by(() => {
		const current = selection;
		return current.kind === 'binder' ? binders.find((entry) => entry.id === current.id) : undefined;
	});
	const wantlist = $derived.by(() => {
		const current = selection;
		return current.kind === 'wantlist'
			? wantlists.find((entry) => entry.id === current.id)
			: undefined;
	});

	const needle = $derived(normalizeForSearch(search));
	const progress = $derived(completion());

	const checklist = $derived(
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

	/** The Binder palette offers the whole catalogue — a Pocket's card need not be owned. Owned
	 * ones sort first, because that's the common case, and the badge shows which is which. */
	const palette = $derived.by(() => {
		const term = normalizeForSearch(paletteSearch);
		return slots
			.filter((slot) => !term || normalizeForSearch(slot.card.name).includes(term))
			.sort((a, b) => ownedCount(b.printing.id) - ownedCount(a.printing.id))
			.slice(0, 18);
	});

	function placeInBinder(printingId: string) {
		if (!binder) return;
		const target =
			selectedPocket !== null
				? { page: pageIndex, pocket: selectedPocket }
				: nextFreePocket(binder);
		if (!target) return;
		place(binder, target.page, target.pocket, printingId);
		pageIndex = target.page;
		selectedPocket = null;
	}
</script>

<div class="flex min-h-[calc(100vh-var(--spacing-nav))]">
	<!-- `self-start` is load-bearing: a flex item stretched to full height has nothing for
	     `sticky` to stick to. `max-h`/`overflow-y-auto` keep a long rail scrollable on its own. -->
	<aside
		class="sticky top-nav hidden h-[calc(100vh-var(--spacing-nav))] w-72 shrink-0 flex-col
			gap-7 self-start overflow-y-auto border-r border-edge bg-shell px-5 py-7 lg:flex"
	>
		<!-- The Collection: pinned, unnamed, deliberately not styled like a list item. -->
		<button
			onclick={() => (selection = { kind: 'collection' })}
			class="rounded-xl border p-4 text-left transition-colors {selection.kind === 'collection'
				? 'border-neon bg-neon/5'
				: 'border-edge hover:border-neon-dim'}"
		>
			<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Collection</p>
			<p class="mt-2 font-mono text-2xl text-bright tabular-nums">
				{progress.owned}<span class="text-base text-muted">/{progress.total}</span>
			</p>
			<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
				<div class="h-full rounded-full bg-neon" style="width: {progress.percent}%"></div>
			</div>
			<p class="mt-2 text-xs text-muted tabular-nums">
				{progress.percent}% complete · {totalCopies()} copies
			</p>
		</button>

		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium tracking-widest text-muted uppercase">Binders</p>
				<button
					onclick={() => addBinder(`Binder ${binders.length + 1}`)}
					class="text-muted hover:text-neon"
					aria-label="New binder">+</button
				>
			</div>
			<ul class="space-y-0.5">
				{#each binders as entry (entry.id)}
					<li>
						<button
							onclick={() => {
								selection = { kind: 'binder', id: entry.id };
								pageIndex = 0;
								selectedPocket = null;
							}}
							class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm
								{selection.kind === 'binder' && selection.id === entry.id
								? 'bg-raised text-bright'
								: 'text-body hover:bg-surface'}"
						>
							<span class="truncate">{entry.name}</span>
							{#if entry.visibility === 'shared'}
								<span class="text-[0.6rem] text-neon-dim">◉</span>
							{/if}
							<span class="ml-auto font-mono text-xs text-muted tabular-nums"
								>{filledPockets(entry)}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		</div>

		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium tracking-widest text-muted uppercase">Wantlists</p>
				<button class="text-muted hover:text-neon" aria-label="New wantlist">+</button>
			</div>
			<ul class="space-y-0.5">
				{#each wantlists as entry (entry.id)}
					<li>
						<button
							onclick={() => (selection = { kind: 'wantlist', id: entry.id })}
							class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm
								{selection.kind === 'wantlist' && selection.id === entry.id
								? 'bg-raised text-bright'
								: 'text-body hover:bg-surface'}"
						>
							<span class="truncate">{entry.name}</span>
							{#if entry.visibility === 'shared'}
								<span class="text-[0.6rem] text-neon-dim">◉</span>
							{/if}
							<span class="ml-auto font-mono text-xs text-muted tabular-nums"
								>{wantedCopies(entry)}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-auto space-y-1 border-t border-edge pt-5 text-sm">
			<button
				onclick={() => (selection = { kind: 'goal' })}
				class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left
					{selection.kind === 'goal' ? 'bg-raised text-bright' : 'text-muted hover:text-neon'}"
			>
				Collecting goal
				<span class="ml-auto font-mono text-xs tabular-nums">{goalSlots().length}</span>
			</button>
			<a href="/sets" class="block px-2.5 py-1.5 text-muted hover:text-neon">Set progress →</a>
			<button class="block w-full px-2.5 py-1.5 text-left text-muted hover:text-neon"
				>Export CSV</button
			>
		</div>
	</aside>

	<div class="min-w-0 flex-1 p-6 sm:p-9">
		{#if selection.kind === 'collection'}
			<div class="mb-6">
				<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Collection</p>
				<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">What you own</h1>
				<p class="mt-2 text-sm text-muted tabular-nums">
					{distinctOwned()} printings · {totalCopies()} copies · always private
				</p>
			</div>

			<div class="mb-8 flex flex-wrap items-center gap-3">
				<input
					bind:value={search}
					placeholder="Search, or try owned:0 set:MS01-WNC"
					class="min-w-56 flex-1 rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm
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

			{#each checklist as group (group.set.id)}
				{#if group.rows.length > 0}
					{@const progress = setProgress(group.set.id)}
					<section class="mb-10">
						<div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h2 class="font-mono text-sm text-neon-dim">{group.set.printed}</h2>
							<span class="text-sm text-muted">{group.set.name}</span>
							<span class="ml-auto font-mono text-xs text-muted tabular-nums"
								>{progress.owned}/{progress.total}</span
							>
						</div>
						<div
							class="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7
								xl:grid-cols-9"
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
											sizes="170px"
											class="rounded-lg"
										/>
									</div>
									<span
										class="pointer-events-none absolute top-1.5 right-1.5 rounded bg-void/90 px-1.5
										py-0.5 font-mono text-[0.6rem] text-muted tabular-nums">{slot.printing.collectorNumber}</span
									>
									<!-- Off Goal: uncounted, but still listed and still ownable. -->
									{#if !inGoal(slot)}
										<span
											class="pointer-events-none absolute inset-x-1.5 top-8 rounded bg-void/80 px-1
												py-0.5 text-center font-mono text-[0.55rem] tracking-wide text-muted
												uppercase">off goal</span
										>
									{/if}
									<div class="absolute inset-x-1 bottom-1">
										<Stepper
											{count}
											compact
											onAdjust={(delta) => adjust(slot.printing.id, delta)}
										/>
									</div>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			{/each}
		{:else if selection.kind === 'goal'}
			<div class="mb-6">
				<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Collecting goal</p>
				<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">What counts as complete</h1>
				<p class="mt-2 text-sm text-muted tabular-nums">
					{goalSlots().length} of {slots.length} printings counted
				</p>
			</div>
			<GoalEditor alwaysOpen />
		{:else if binder}
			<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
				<div>
					<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Binder</p>
					<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">{binder.name}</h1>
					<p class="mt-2 text-sm text-muted tabular-nums">
						{filledPockets(binder)} of {totalPockets(binder)} pockets filled · {binder.pages.length} pages
						{#if binder.visibility === 'shared'}
							· <span class="text-neon">shared by link</span>
						{/if}
					</p>
				</div>
				<div class="flex gap-2">
					<button
						class="rounded-lg border border-edge px-3.5 py-2 text-sm text-muted
							hover:border-neon-dim hover:text-neon">Share</button
					>
					<button
						class="rounded-lg border border-edge px-3.5 py-2 text-sm text-muted
							hover:border-neon-dim hover:text-neon">Rename</button
					>
				</div>
			</div>

			<p class="mb-6 border-l-2 border-neon-dim bg-shell/60 px-4 py-2.5 text-sm text-muted">
				Pick a pocket, then a card — or click a card to drop it in the next free pocket. A binder
				shows cards off; it doesn't record what you own.
			</p>

			<div class="flex flex-col gap-8 2xl:flex-row">
				<section class="min-w-0 flex-1">
					<PocketSpread
						{binder}
						page={Math.min(pageIndex, binder.pages.length - 1)}
						selected={selectedPocket}
						onSelect={(pocket) => (selectedPocket = selectedPocket === pocket ? null : pocket)}
					/>

					<div class="mt-4 flex flex-wrap items-center justify-center gap-1">
						<button
							onclick={() => (pageIndex = Math.max(0, pageIndex - 1))}
							disabled={pageIndex === 0}
							class="grid size-8 place-items-center rounded text-muted hover:text-bright
								disabled:opacity-30">◀</button
						>
						{#each binder.pages as pockets, index (index)}
							<button
								onclick={() => {
									pageIndex = index;
									selectedPocket = null;
								}}
								class="size-8 rounded font-mono text-sm {index === pageIndex
									? 'bg-raised text-bright'
									: 'text-muted hover:text-body'}"
								title="{pockets.filter((pocket) => pocket !== null).length} of 9 pockets filled"
								>{index + 1}</button
							>
						{/each}
						<button
							onclick={() => (pageIndex = Math.min(binder.pages.length - 1, pageIndex + 1))}
							disabled={pageIndex === binder.pages.length - 1}
							class="grid size-8 place-items-center rounded text-muted hover:text-bright
								disabled:opacity-30">▶</button
						>
						<button
							onclick={() => addPage(binder)}
							class="ml-3 rounded border border-edge px-3 py-1.5 text-xs text-muted
								hover:border-neon-dim hover:text-neon">+ Page</button
						>
						{#if binder.pages.length > 1}
							<button
								onclick={() => {
									removePage(binder, pageIndex);
									pageIndex = Math.max(0, pageIndex - 1);
								}}
								class="rounded border border-edge px-3 py-1.5 text-xs text-muted
									hover:border-card-red hover:text-card-red">Remove page</button
							>
						{/if}
					</div>
				</section>

				<aside class="w-full shrink-0 2xl:w-80">
					<h2 class="mb-3 text-sm font-medium tracking-widest text-muted uppercase">Add a card</h2>
					<input
						bind:value={paletteSearch}
						placeholder="Search every printing"
						class="mb-4 w-full rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm
							text-body placeholder:text-muted/60"
					/>
					<div class="grid grid-cols-4 gap-2 2xl:grid-cols-3">
						{#each palette as slot (slot.printing.id)}
							{@const owned = ownedCount(slot.printing.id)}
							<button
								onclick={() => placeInBinder(slot.printing.id)}
								class="relative overflow-hidden rounded transition-transform hover:-translate-y-0.5"
								title="{slot.card.name} — {owned > 0 ? `×${owned} owned` : 'not owned'}"
							>
								<div class:opacity-45={owned === 0}>
									<CardImage
										printingId={slot.printing.id}
										thumbhash={slot.printing.thumbhash}
										color={slot.card.color}
										alt={slot.card.name}
										sizes="100px"
									/>
								</div>
								<span
									class="absolute right-0.5 bottom-0.5 rounded bg-void/85 px-1 font-mono
										text-[0.55rem] tabular-nums {owned > 0 ? 'text-bright' : 'text-muted/70'}"
									>{owned > 0 ? `×${owned}` : '—'}</span
								>
							</button>
						{/each}
					</div>
					<p class="mt-3 text-xs text-muted">
						Dimmed cards aren't in your collection. You can still shelve them — a pocket is a plan
						as much as a record.
					</p>
				</aside>
			</div>
		{:else if wantlist}
			<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
				<div>
					<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Wantlist</p>
					<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">{wantlist.name}</h1>
					<p class="mt-2 text-sm text-muted tabular-nums">
						{wantedCopies(wantlist)} copies wanted · {wantlist.entries.size} printings
						{#if wantlist.visibility === 'shared'}
							· <span class="text-neon">shared by link</span>
						{/if}
					</p>
				</div>
				<button
					class="rounded-lg border border-edge px-3.5 py-2 text-sm text-muted hover:border-neon-dim
						hover:text-neon">Share</button
				>
			</div>

			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b border-edge/60 text-muted">
						<th class="pb-3 font-medium">Card</th>
						<th class="pb-3 font-medium">Set</th>
						<th class="pb-3 text-right font-medium">Owned</th>
						<th class="pb-3 text-right font-medium">Wanted</th>
					</tr>
				</thead>
				<tbody>
					{#each [...wantlist.entries] as [printingId, quantity] (printingId)}
						{@const slot = slotByPrintingId.get(printingId)}
						{#if slot}
							<tr class="border-b border-edge/30">
								<td class="py-3 text-body">{slot.card.name}</td>
								<td class="py-3 font-mono text-xs text-muted"
									>{slot.printing.setId} · {slot.printing.collectorNumber}</td
								>
								<td class="py-3 text-right font-mono text-muted tabular-nums"
									>{ownedCount(printingId) || '—'}</td
								>
								<td class="w-32 py-3">
									<Stepper
										count={quantity}
										onAdjust={(delta) => adjustWant(wantlist, printingId, delta)}
									/>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
