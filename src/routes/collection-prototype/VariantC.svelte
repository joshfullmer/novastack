<script lang="ts">
	/**
	 * PROTOTYPE — Variant C: "Binder forward".
	 *
	 * Hierarchy bet: the **showcase** is the destination. You arrive at a shelf of binder covers,
	 * open one, and arrange it; the Collection is bookkeeping you visit occasionally, behind a
	 * secondary tab. The inverse of Variant A.
	 *
	 * Worth judging on one question: does putting display first make the tracker feel like a thing
	 * you'd show someone — or does it bury the completion loop that actually brings people back?
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
		binders,
		completion,
		distinctOwned,
		filledPockets,
		nextFreePocket,
		ownedCount,
		place,
		rarityProgress,
		slotByPrintingId,
		slots,
		slotsBySet,
		totalCopies,
		totalPockets
	} from './fake-collection.svelte.js';

	let view = $state<'shelf' | 'collection'>('shelf');
	let openId = $state<string | null>(binders[0].id);
	let pageIndex = $state(0);
	let selectedPocket = $state<number | null>(null);
	let paletteSearch = $state('');
	let collectionSearch = $state('');

	const open = $derived(binders.find((entry) => entry.id === openId));

	/** A binder's cover art is its first filled pocket — the shelf reads as objects, not rows. */
	function coverOf(binderId: string) {
		const binder = binders.find((entry) => entry.id === binderId);
		const first = binder?.pages.flat().find((pocket) => pocket !== null);
		return first ? slotByPrintingId.get(first) : undefined;
	}

	const palette = $derived.by(() => {
		const term = normalizeForSearch(paletteSearch);
		return slots
			.filter((slot) => !term || normalizeForSearch(slot.card.name).includes(term))
			.sort((a, b) => ownedCount(b.printing.id) - ownedCount(a.printing.id))
			.slice(0, 12);
	});

	function placeInBinder(printingId: string) {
		if (!open) return;
		const target =
			selectedPocket !== null ? { page: pageIndex, pocket: selectedPocket } : nextFreePocket(open);
		if (!target) return;
		place(open, target.page, target.pocket, printingId);
		pageIndex = target.page;
		selectedPocket = null;
	}

	const collectionNeedle = $derived(normalizeForSearch(collectionSearch));
</script>

<div class="mx-auto max-w-[1500px] p-6 sm:p-10">
	<div class="mb-8 flex flex-wrap items-end justify-between gap-6">
		<div>
			<p class="text-sm font-medium tracking-widest text-neon-dim uppercase">Your binders</p>
			<h1 class="mt-1 text-5xl font-bold tracking-tight text-bright">Show it off</h1>
			<p class="mt-2 max-w-xl text-muted">
				Arrange the cards you're proud of into pages. Share a binder by link — your collection
				itself stays private.
			</p>
		</div>
		<div class="flex gap-1 rounded-lg border border-edge p-1">
			<button
				onclick={() => (view = 'shelf')}
				class="rounded px-4 py-2 text-sm {view === 'shelf'
					? 'bg-raised text-bright'
					: 'text-muted hover:text-body'}">Binders</button
			>
			<button
				onclick={() => (view = 'collection')}
				class="rounded px-4 py-2 text-sm {view === 'collection'
					? 'bg-raised text-bright'
					: 'text-muted hover:text-body'}"
				>Collection <span class="font-mono text-xs">{distinctOwned()}</span></button
			>
		</div>
	</div>

	{#if view === 'shelf'}
		<!-- The shelf: binders as objects with cover art, not as list rows. -->
		<div class="mb-10 flex flex-wrap gap-5">
			{#each binders as entry (entry.id)}
				{@const cover = coverOf(entry.id)}
				<button
					onclick={() => {
						openId = entry.id;
						pageIndex = 0;
						selectedPocket = null;
					}}
					class="group w-44 text-left"
				>
					<div
						class="relative card-frame overflow-hidden rounded-lg border-2 transition-transform
							group-hover:-translate-y-1 {entry.id === openId ? 'border-neon' : 'border-edge'}"
					>
						{#if cover}
							<CardImage
								printingId={cover.printing.id}
								thumbhash={cover.printing.thumbhash}
								color={cover.card.color}
								alt=""
								sizes="180px"
							/>
						{:else}
							<span class="absolute inset-0 grid place-items-center text-xs text-muted/50"
								>empty binder</span
							>
						{/if}
						<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-void to-transparent p-3">
							<p class="truncate text-sm font-medium text-bright">{entry.name}</p>
							<p class="font-mono text-[0.65rem] text-muted tabular-nums">
								{filledPockets(entry)}/{totalPockets(entry)} pockets
								{#if entry.visibility === 'shared'}· shared{/if}
							</p>
						</div>
					</div>
				</button>
			{/each}
			<button
				onclick={() => addBinder(`Binder ${binders.length + 1}`)}
				class="grid card-frame w-44 place-items-center rounded-lg border-2 border-dashed
					border-edge text-sm text-muted hover:border-neon-dim hover:text-neon">+ New binder</button
			>
		</div>

		{#if open}
			<div class="flex flex-col gap-8 xl:flex-row">
				<section class="min-w-0 flex-1">
					<div class="mb-3 flex flex-wrap items-baseline gap-3">
						<h2 class="text-2xl font-semibold text-bright">{open.name}</h2>
						<span class="font-mono text-sm text-muted"
							>page {pageIndex + 1} of {open.pages.length}</span
						>
						<div class="ml-auto flex gap-2">
							<button
								class="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted
									hover:border-neon-dim hover:text-neon">Share</button
							>
							<button
								onclick={() => addPage(open)}
								class="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted
									hover:border-neon-dim hover:text-neon">+ Page</button
							>
						</div>
					</div>

					<PocketSpread
						binder={open}
						page={Math.min(pageIndex, open.pages.length - 1)}
						selected={selectedPocket}
						onSelect={(pocket) => (selectedPocket = selectedPocket === pocket ? null : pocket)}
					/>

					<div class="mt-4 flex items-center justify-center gap-1">
						{#each open.pages as pockets, index (index)}
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
					</div>
				</section>

				<aside class="w-full shrink-0 xl:w-72">
					<h3 class="mb-3 text-sm font-medium tracking-widest text-muted uppercase">Add a card</h3>
					<input
						bind:value={paletteSearch}
						placeholder="Search printings"
						class="mb-4 w-full rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm
							text-body placeholder:text-muted/60"
					/>
					<div class="grid grid-cols-3 gap-2">
						{#each palette as slot (slot.printing.id)}
							{@const owned = ownedCount(slot.printing.id)}
							<button
								onclick={() => placeInBinder(slot.printing.id)}
								class="relative overflow-hidden rounded transition-transform hover:-translate-y-0.5"
								title={slot.card.name}
							>
								<div class:opacity-45={owned === 0}>
									<CardImage
										printingId={slot.printing.id}
										thumbhash={slot.printing.thumbhash}
										color={slot.card.color}
										alt={slot.card.name}
										sizes="90px"
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
				</aside>
			</div>
		{/if}
	{:else}
		<!-- The Collection, demoted to a ledger. Progress rails keep the completion loop visible. -->
		<div class="flex flex-col gap-10 lg:flex-row">
			<div class="min-w-0 flex-1">
				<input
					bind:value={collectionSearch}
					placeholder="Search your collection"
					class="mb-6 w-full max-w-md rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm
						text-body placeholder:text-muted/60"
				/>
				{#each slotsBySet as group (group.set.id)}
					{@const rows = group.slots.filter(
						(slot) =>
							ownedCount(slot.printing.id) > 0 &&
							(!collectionNeedle || normalizeForSearch(slot.card.name).includes(collectionNeedle))
					)}
					{#if rows.length > 0}
						<section class="mb-8">
							<div class="mb-2 flex items-baseline gap-3">
								<h2 class="font-mono text-sm text-neon-dim">{group.set.printed}</h2>
								<span class="text-sm text-muted">{group.set.name}</span>
							</div>
							<table class="w-full text-left text-sm">
								<tbody>
									{#each rows as slot (slot.printing.id)}
										<tr class="border-b border-edge/30">
											<td class="w-14 py-2 font-mono text-xs text-muted"
												>{slot.printing.collectorNumber}</td
											>
											<td class="py-2 text-body">{slot.card.name}</td>
											<td class="py-2 text-xs text-muted">{slot.printing.rarity}</td>
											<td class="w-28 py-2">
												<Stepper
													count={ownedCount(slot.printing.id)}
													onAdjust={(delta) => adjust(slot.printing.id, delta)}
												/>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</section>
					{/if}
				{/each}
			</div>

			<aside class="w-full shrink-0 space-y-6 lg:w-72">
				<GoalEditor />
				<div class="rounded-xl border border-edge bg-shell p-5">
					<p class="font-mono text-2xl text-bright tabular-nums">
						{completion().owned}<span class="text-base text-muted">/{completion().total}</span>
					</p>
					<p class="mt-1 text-xs tracking-wide text-muted uppercase">
						In goal · {completion().percent}% · {totalCopies()} copies
					</p>
				</div>
				<div>
					<p class="mb-3 text-xs font-medium tracking-widest text-muted uppercase">By rarity</p>
					<ul class="space-y-2.5">
						{#each rarityProgress() as row (row.rarity)}
							<li>
								<div class="mb-1 flex items-baseline justify-between text-sm">
									<span class="text-body">{row.rarity}</span>
									<span class="font-mono text-xs text-muted tabular-nums"
										>{row.owned}/{row.total}</span
									>
								</div>
								<div class="h-1 overflow-hidden rounded-full bg-surface">
									<div
										class="h-full rounded-full bg-neon-dim"
										style="width: {(row.owned / row.total) * 100}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			</aside>
		</div>
	{/if}
</div>
