<script lang="ts">
	/**
	 * PROTOTYPE — Variant D: "Entry console".
	 *
	 * Hierarchy bet: **entry speed wins**. The Collection is a thing you fill, not a thing you
	 * browse, so the page is one focused field plus feedback. Binders aren't here at all — under
	 * the flat model there's no "where does this go" question to answer, so rapid entry needs no
	 * destination picker. That absence is the point.
	 *
	 * Borrowed from outside this genre:
	 *  - ManaBox / Delver Lens / Dragon Shield companion (MTG): one rapid-entry field, a running
	 *    session log, per-entry undo. Built for entering a box in one sitting.
	 *  - MTG Arena / Legends of Runeterra collection screens: completion by **rarity**, which is
	 *    the axis that says how far off "done" really is — the Common and Iconic Legend gaps are
	 *    not the same kind of gap.
	 *  - Discogs / Letterboxd: a "recently added" strip, so the collection feels like it grows.
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import { normalizeForSearch } from '#lib/cards/dataset.js';
	import GoalEditor from './GoalEditor.svelte';
	import {
		adjust,
		completion,
		ownedCount,
		rarityProgress,
		setProgress,
		slots,
		slotsBySet,
		totalCopies,
		type Slot
	} from './fake-collection.svelte.js';

	let raw = $state('');
	let field = $state<HTMLInputElement>();
	let log = $state<{ slot: Slot; quantity: number; id: string }[]>([]);
	let highlight = $state(0);

	/** `042`, `β042 x3`, `3x adam`, `adam smasher` — quantity on either end, term in the middle. */
	function parse(input: string): { quantity: number; term: string } {
		const trimmed = input.trim();
		const trailing = /^(.*?)\s*[x×*]\s*(\d+)$/i.exec(trimmed);
		if (trailing) return { quantity: Number(trailing[2]), term: trailing[1].trim() };
		const leading = /^(\d+)\s*[x×*]\s*(.*)$/i.exec(trimmed);
		if (leading) return { quantity: Number(leading[1]), term: leading[2].trim() };
		return { quantity: 1, term: trimmed };
	}

	const parsed = $derived(parse(raw));

	/** Collector number first — that's what's printed on the card in your hand. */
	const matches = $derived.by(() => {
		const term = parsed.term;
		if (term.length === 0) return [];
		const lower = term.toLowerCase();
		const needle = normalizeForSearch(term);

		const exact = slots.filter((slot) => slot.printing.collectorNumber.toLowerCase() === lower);
		const prefix = slots.filter(
			(slot) =>
				slot.printing.collectorNumber.toLowerCase().startsWith(lower) && !exact.includes(slot)
		);
		const byName = needle
			? slots.filter(
					(slot) =>
						normalizeForSearch(slot.card.name).includes(needle) &&
						!exact.includes(slot) &&
						!prefix.includes(slot)
				)
			: [];

		return [...exact, ...prefix, ...byName].slice(0, 7);
	});

	function commit(slot: Slot | undefined = matches[highlight]) {
		if (!slot) return;
		adjust(slot.printing.id, parsed.quantity);
		log.unshift({ slot, quantity: parsed.quantity, id: crypto.randomUUID() });
		raw = '';
		highlight = 0;
		field?.focus();
	}

	function undo(entry: { slot: Slot; quantity: number; id: string }) {
		adjust(entry.slot.printing.id, -entry.quantity);
		log = log.filter((other) => other.id !== entry.id);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlight = Math.min(highlight + 1, matches.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlight = Math.max(highlight - 1, 0);
		}
	}

	const sessionCopies = $derived(log.reduce((sum, entry) => sum + entry.quantity, 0));
</script>

<div class="mx-auto max-w-[1500px] p-6 sm:p-10">
	<div class="mb-8">
		<p class="text-sm font-medium tracking-widest text-neon-dim uppercase">Rapid entry</p>
		<h1 class="mt-1 text-5xl font-bold tracking-tight text-bright">Add to collection</h1>
		<p class="mt-2 text-muted">
			Type the collector number printed on the card and press Enter. <span class="text-body"
				>042</span
			>, <span class="text-body">β042 ×3</span>, <span class="text-body">3x adam smasher</span>. No
			destination to choose — it all goes to your collection.
		</p>
	</div>

	<div class="flex flex-col gap-10 lg:flex-row">
		<section class="min-w-0 flex-1">
			<div class="relative">
				<input
					bind:this={field}
					bind:value={raw}
					onkeydown={onKeydown}
					placeholder="Collector number, or a name…"
					autocomplete="off"
					class="w-full rounded-xl border-2 border-edge bg-surface px-5 py-5 font-mono text-2xl
						text-bright placeholder:text-muted/50 focus:border-neon focus:outline-none"
				/>
				{#if parsed.quantity > 1}
					<span
						class="absolute top-1/2 right-5 -translate-y-1/2 rounded-md bg-neon/15 px-3 py-1.5
							font-mono text-sm text-neon">×{parsed.quantity}</span
					>
				{/if}
			</div>

			{#if matches.length > 0}
				<ul class="mt-2 overflow-hidden rounded-xl border border-edge bg-shell">
					{#each matches as slot, index (slot.printing.id)}
						<li>
							<button
								onclick={() => commit(slot)}
								onmouseenter={() => (highlight = index)}
								class="flex w-full items-center gap-4 px-4 py-3 text-left
									{index === highlight ? 'bg-raised' : 'hover:bg-surface'}"
							>
								<span class="w-16 shrink-0 font-mono text-sm text-neon tabular-nums"
									>{slot.printing.collectorNumber}</span
								>
								<span class="min-w-0 flex-1 truncate text-body">{slot.card.name}</span>
								<span class="shrink-0 font-mono text-xs text-muted"
									>{slot.printing.setId}{#if slot.printing.locale !== 'en'}
										· {slot.printing.locale.toUpperCase()}{/if}</span
								>
								<span class="w-20 shrink-0 text-right text-xs text-muted"
									>{slot.printing.rarity}</span
								>
								<span class="w-12 shrink-0 text-right font-mono text-sm text-bright tabular-nums"
									>{ownedCount(slot.printing.id) > 0
										? `×${ownedCount(slot.printing.id)}`
										: '—'}</span
								>
							</button>
						</li>
					{/each}
				</ul>
			{:else if raw.trim().length > 0}
				<p class="mt-3 px-1 text-sm text-muted">No printing matches “{parsed.term}”.</p>
			{/if}

			<div class="mt-10">
				<div class="mb-3 flex items-baseline gap-3">
					<h2 class="text-lg font-semibold text-bright">This session</h2>
					<span class="font-mono text-sm text-muted tabular-nums"
						>{log.length} entries · {sessionCopies} copies</span
					>
					{#if log.length > 0}
						<button
							onclick={() => {
								for (const entry of [...log]) undo(entry);
							}}
							class="ml-auto text-sm text-muted hover:text-neon">Undo all</button
						>
					{/if}
				</div>

				{#if log.length === 0}
					<p class="rounded-lg border border-dashed border-edge px-4 py-8 text-center text-muted">
						Nothing added yet. The field above is already focused — start typing numbers.
					</p>
				{:else}
					<ul class="space-y-1">
						{#each log as entry (entry.id)}
							<li
								class="flex items-center gap-4 rounded-lg border border-edge/50 bg-shell px-4 py-2.5"
							>
								<span class="w-14 shrink-0 font-mono text-sm text-neon tabular-nums"
									>+{entry.quantity}</span
								>
								<span class="min-w-0 flex-1 truncate text-sm text-body">{entry.slot.card.name}</span
								>
								<span class="shrink-0 font-mono text-xs text-muted"
									>{entry.slot.printing.setId} · {entry.slot.printing.collectorNumber}</span
								>
								<button
									onclick={() => undo(entry)}
									class="shrink-0 text-xs text-muted hover:text-neon">undo</button
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if log.length > 0}
				<div class="mt-8">
					<p class="mb-3 text-xs font-medium tracking-widest text-muted uppercase">
						Recently added
					</p>
					<div class="flex gap-2 overflow-x-auto pb-2">
						{#each log.slice(0, 14) as entry (entry.id)}
							<div class="w-20 shrink-0">
								<CardImage
									printingId={entry.slot.printing.id}
									thumbhash={entry.slot.printing.thumbhash}
									color={entry.slot.card.color}
									alt={entry.slot.card.name}
									sizes="80px"
									class="rounded"
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<aside class="w-full shrink-0 space-y-8 lg:w-80">
			<div class="rounded-xl border border-edge bg-shell p-6">
				<p class="font-mono text-3xl text-bright tabular-nums">
					{completion().owned}<span class="text-lg text-muted">/{completion().total}</span>
				</p>
				<p class="mt-1 text-xs tracking-wide text-muted uppercase">
					In goal · {completion().percent}% · {totalCopies()} copies
				</p>
				<div class="mt-4 h-2 overflow-hidden rounded-full bg-surface">
					<div
						class="h-full rounded-full bg-neon transition-[width] duration-300"
						style="width: {completion().percent}%"
					></div>
				</div>
			</div>

			<GoalEditor />

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
									class="h-full rounded-full bg-neon-dim transition-[width] duration-300"
									style="width: {(row.owned / row.total) * 100}%"
								></div>
							</div>
						</li>
					{/each}
				</ul>
			</div>

			<div>
				<p class="mb-3 text-xs font-medium tracking-widest text-muted uppercase">By set</p>
				<ul class="space-y-2.5">
					{#each slotsBySet as group (group.set.id)}
						{@const progress = setProgress(group.set.id)}
						<li>
							<div class="mb-1 flex items-baseline justify-between gap-2 text-sm">
								<span class="min-w-0 truncate text-body">{group.set.name}</span>
								<span class="shrink-0 font-mono text-xs text-muted tabular-nums"
									>{progress.owned}/{progress.total}</span
								>
							</div>
							<div class="h-1 overflow-hidden rounded-full bg-surface">
								<div
									class="h-full rounded-full bg-neon-dim transition-[width] duration-300"
									style="width: {(progress.owned / progress.total) * 100}%"
								></div>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</aside>
	</div>
</div>
