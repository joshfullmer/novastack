<script lang="ts">
	/**
	 * The Deck view's **Collection** tab — the decklist as a checklist against what you own.
	 *
	 * Replaces `MissingPanel`, which said the same thing in one line above the deck and offered a
	 * Wantlist. The line was the wrong shape for the job: reconciling a list against a shelf means
	 * going card by card and *correcting counts as you go*, and there was nowhere to type a count.
	 * So the whole thing moved behind its own tab, where a row per card fits.
	 *
	 * **Every card, not just the ones you're short of.** A checklist you work down has to include
	 * what you already have — both to tick off and, more importantly, because a count can be wrong
	 * in the other direction and there'd otherwise be no way to fix it.
	 *
	 * Reads and writes the Collection store directly, like `QuantityStepper` does and for the same
	 * reason: a Collection is a singleton, several surfaces show it at once, and threading it as
	 * props only creates chances for two of them to disagree. Writes are optimistic and absolute —
	 * see `state.svelte.ts`.
	 *
	 * The arithmetic all lives in `#lib/collection/deck-collection.ts`, deliberately: which Printing
	 * a `+1` lands on, where a `−1` comes from, and what "add all" means are the decisions worth
	 * testing without a browser.
	 */
	import { collection } from '#lib/collection/state.svelte.js';
	import {
		deckCollectionRows,
		deckCollectionSummary,
		removeTarget,
		topUpPlan
	} from '#lib/collection/deck-collection.js';
	import { printTreatment } from '#lib/cards/derive.js';
	import type { Card } from '#lib/cards/schema.js';
	import type { NeededCard } from '#lib/collection/missing.js';
	import type { WantlistSummary } from '#lib/collection/wantlists.js';
	import { costToComplete, MARKETPLACE_INFO, MARKETPLACES } from '#lib/prices/cost.js';
	import { formatMoney } from '#lib/prices/format.js';
	import { prices } from '#lib/prices/state.svelte.js';
	import { COLOR_TEXT } from './color.js';
	import CostTotals from './CostTotals.svelte';
	import PriceNote from './PriceNote.svelte';

	let {
		entries,
		/**
		 * Called when a row is hovered, so the host can show that card. The deck view has a sticky
		 * preview panel that every other list on the page already drives this way; without it, the
		 * one tab where you're reading card names one at a time would be the only place the preview
		 * sat on a stale card.
		 *
		 * A callback rather than a bound `focused` prop: the panel has no opinion about what
		 * "showing" a card means, and nothing here reads it back.
		 */
		onFocusCard
	}: { entries: readonly NeededCard[]; onFocusCard?: (card: Card) => void } = $props();

	$effect(() => void collection.load());

	const rows = $derived(deckCollectionRows(entries, (id) => collection.quantityOf(id)));
	const summary = $derived(deckCollectionSummary(rows));

	// Priced at the headline's own figure — the Card-level shortfall — so "missing 7 cards" and "to
	// buy: $4.20" are about the same seven cards. See `#lib/prices/cost.ts` for which printing.
	$effect(() => void prices.load());
	const cost = $derived(
		costToComplete(
			rows.map((row) => ({ card: row.card, copies: row.playableMissing })),
			(id) => prices.quote(id)
		)
	);
	const offersBySlug = $derived(new Map(cost.rows.map((row) => [row.card.slug, row.offers])));
	const shortPrintingIds = $derived(
		cost.rows.flatMap((row) => row.card.printings.map((printing) => printing.id))
	);
	const anyPriced = $derived(
		MARKETPLACES.some((marketplace) => cost.totals[marketplace].priced > 0)
	);

	/** Wantlist menu state, carried over from `MissingPanel`. `null` until fetched, so "none yet"
	 * stays distinguishable from "not asked". */
	let menuOpen = $state(false);
	let wantlists = $state<WantlistSummary[] | null>(null);
	let busy = $state(false);
	let failure = $state<string | null>(null);
	let added = $state<{ wantlistId: string; copies: number } | null>(null);
	let newName = $state('');

	/** Non-null only while the bulk write is in flight, so the button can say what it's doing. */
	let toppingUp = $state(false);

	async function openMenu() {
		menuOpen = true;
		failure = null;
		if (wantlists !== null) return;

		try {
			const response = await fetch('/api/collection/wantlists');
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			// Asserted rather than parsed, matching `state.svelte.ts`: our own endpoint answering our
			// own request, and the only consumer of the shape is the markup below.
			const body = (await response.json()) as { wantlists: WantlistSummary[] };
			wantlists = body.wantlists;
		} catch {
			failure = "Couldn't load your wantlists.";
		}
	}

	/**
	 * Posts the shortfall to a Wantlist — an existing one by id, or a new one by name.
	 *
	 * Sends the *missing* count per card, not the deck's requirement: you already own the rest, and
	 * a Wantlist asking for three of a card you hold two of would send you shopping for the wrong
	 * number. The endpoint adds rather than replaces, so doing this for two decks that share a card
	 * asks for both.
	 */
	async function addToWantlist(target: { wantlistId: string } | { name: string }) {
		busy = true;
		failure = null;

		const items = rows
			.filter((row) => row.missing > 0)
			.map((row) => ({ printingId: row.addTarget, quantity: row.missing }));

		try {
			const response = await fetch('/api/collection/wantlists', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...target, items })
			});
			if (!response.ok) throw new Error(await response.text());

			const result = (await response.json()) as { wantlistId: string };
			added = { wantlistId: result.wantlistId, copies: summary.copiesShort };
			menuOpen = false;
			newName = '';
			// Stale now: the new copies aren't in it, and the menu reopens often enough that a
			// refetch is cheaper than getting the counts wrong.
			wantlists = null;
		} catch {
			failure = "Couldn't add those to a wantlist.";
		} finally {
			busy = false;
		}
	}

	/**
	 * "Add all to collection" — tops every short card up to what the deck asks for.
	 *
	 * One bulk write rather than a request per card (`setMany`), which D1 runs in a transaction: a
	 * half-applied top-up would leave the checklist disagreeing with the next page load, and the
	 * client has no way to know which half landed.
	 */
	async function addAll() {
		const plan = topUpPlan(rows, (id) => collection.quantityOf(id));
		if (plan.size === 0) return;

		toppingUp = true;
		try {
			await collection.setMany(plan);
		} finally {
			toppingUp = false;
		}
	}

	function step(row: (typeof rows)[number], delta: 1 | -1) {
		if (delta === 1) {
			collection.adjust(row.addTarget, 1);
			return;
		}
		const target = removeTarget(row, (id) => collection.quantityOf(id));
		if (target) collection.adjust(target, -1);
	}
</script>

<!--
	Signed out, the tab renders an invitation rather than a table of zeroes: every count would read
	`0/3` and every control would be dead, which looks like a broken page rather than a feature
	you don't have yet. `collection.editable` (the store has actually loaded) rather than "not
	signed out", for the reason `MissingPanel` documented: the store can't know either way until
	its fetch lands, and a confident "you own none of this" in the server HTML is wrong for the
	first second of every load.
-->
{#if !collection.editable}
	<p class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-muted">
		{#if collection.signedOut}
			<a href="/auth/login" class="text-neon hover:text-bright">Sign in</a> to track which of these cards
			you own.
		{:else}
			Loading your collection…
		{/if}
	</p>
{:else}
	<div class="rounded-md border border-edge bg-surface">
		<div class="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-edge px-3 py-2.5">
			{#if summary.complete}
				<p class="text-sm font-medium text-neon-dim">
					You own every card in this deck.{#if summary.printingShortfallCards > 0}<span
							class="font-normal text-muted"
						>
							· {summary.printingShortfallCards}
							{summary.printingShortfallCards === 1 ? 'card' : 'cards'} not in the printing this deck
							chose</span
						>{/if}
				</p>
			{:else}
				<p class="text-sm font-medium text-bright">
					You're missing {summary.cardsShort}
					{summary.cardsShort === 1 ? 'card' : 'cards'}
					<span class="text-muted tabular-nums">· {summary.copiesShort} copies</span>
				</p>
			{/if}

			<span class="text-xs text-muted tabular-nums">
				{summary.cardsComplete}/{summary.cards} complete
			</span>

			<div class="ml-auto flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={addAll}
					disabled={summary.complete || toppingUp || collection.saving}
					title="Raise every count to what the deck needs. Copies you already own aren't
						double-counted, so pressing this twice changes nothing."
					class="rounded border border-neon bg-neon/10 px-2.5 py-1 text-xs text-neon
						transition-colors hover:bg-neon/20 disabled:border-edge disabled:bg-transparent
						disabled:text-muted"
				>
					{toppingUp ? 'Adding…' : 'Add all to collection'}
				</button>

				{#if added}
					<a
						href="/collection/wantlists/{added.wantlistId}"
						class="text-xs text-neon hover:text-bright"
						>Added {added.copies} copies — open wantlist ›</a
					>
				{:else}
					<button
						type="button"
						onclick={openMenu}
						disabled={summary.complete}
						class="rounded border border-edge px-2 py-1 text-xs text-muted transition-colors
							hover:border-neon-dim hover:text-neon disabled:opacity-40">Add to wantlist</button
					>
				{/if}
			</div>
		</div>

		<!-- What buying the shortfall costs. Only when something is short *and* something is priced:
		     a complete deck has nothing to buy, and a row of "unpriced" before the snapshot lands (or
		     for a deck of cards nobody lists yet) would be noise. Each marketplace is its own total
		     in its own currency and says how many cards it covers — a total over 5 of 7 cards is a
		     floor, not a price, and the number of cards left out is the thing that says so. -->
		{#if !summary.complete && anyPriced}
			<div class="border-b border-edge px-3 py-2">
				<CostTotals totals={cost.totals} of={cost.rows.length} noun="card" />
				<p class="mt-1 text-xs text-muted/70">
					The cheapest English printing of each card, beta included until retail is on sale.
				</p>
				<PriceNote printingIds={shortPrintingIds} class="mt-0.5" />
			</div>
		{/if}

		{#if menuOpen}
			<div class="border-b border-edge bg-void/30 px-3 py-2.5">
				{#if wantlists === null && !failure}
					<p class="text-xs text-muted">Loading your wantlists…</p>
				{:else if wantlists !== null}
					{#if wantlists.length > 0}
						<ul class="flex flex-wrap gap-1.5">
							{#each wantlists as wantlist (wantlist.id)}
								<li>
									<button
										type="button"
										disabled={busy}
										onclick={() => addToWantlist({ wantlistId: wantlist.id })}
										class="rounded-full border border-edge px-2.5 py-1 text-xs text-body
											transition-colors hover:border-neon-dim hover:text-neon disabled:opacity-50">{wantlist.name}</button
									>
								</li>
							{/each}
						</ul>
					{/if}

					<form
						class="mt-2 flex flex-wrap items-center gap-2"
						onsubmit={(event) => {
							event.preventDefault();
							if (newName.trim()) void addToWantlist({ name: newName.trim() });
						}}
					>
						<input
							bind:value={newName}
							maxlength="60"
							placeholder={wantlists.length > 0 ? 'Or a new wantlist…' : 'Name a new wantlist…'}
							class="min-w-40 flex-1 rounded border border-edge bg-shell px-2 py-1 text-xs text-body
								placeholder:text-muted/60"
						/>
						<button
							type="submit"
							disabled={busy || newName.trim() === ''}
							class="rounded border border-neon bg-neon/10 px-2.5 py-1 text-xs text-neon
								disabled:opacity-40">Create & add</button
						>
						<button
							type="button"
							onclick={() => (menuOpen = false)}
							class="text-xs text-muted hover:text-body">Cancel</button
						>
					</form>
				{/if}
			</div>
		{/if}

		{#if failure || collection.error}
			<p class="border-b border-edge px-3 py-2 text-xs text-card-red">
				{failure ?? collection.error}
			</p>
		{/if}

		<!-- A list, not a grid: the row is doing four jobs at once (name, owned, needed, controls),
		     and three of the four are numbers you read against each other. -->
		<ul role="list">
			{#each rows as row (row.card.slug)}
				{@const short = row.missing > 0}
				{@const offers = row.playableMissing > 0 ? offersBySlug.get(row.card.slug) : undefined}
				<li class="flex items-center gap-3 border-b border-edge/50 px-3 py-1.5 last:border-b-0">
					<span
						class="min-w-0 flex-1 truncate text-sm {COLOR_TEXT[row.card.color]}"
						onmouseenter={() => onFocusCard?.(row.card)}
						role="presentation"
					>
						{row.card.name}
						{#if row.scope === 'printing' && row.ownedElsewhere > 0}
							<!-- The disclosure that keeps a scoped `0/3` from reading as a bug: you *do* hold
							     copies, just not the art this deck asked for. -->
							<span class="text-[0.65rem] text-muted/70"
								>· {row.ownedElsewhere} in other printings</span
							>
						{:else if row.scope === 'card' && row.printingsHeld > 1}
							<!-- Explains a total that doesn't match any single printing's count, which is
							     otherwise baffling on a card you hold in two languages. -->
							<span class="text-[0.65rem] text-muted/70"
								>· across {row.printingsHeld} printings</span
							>
						{/if}
					</span>

					<!-- The cheapest printing's price, per copy, linked to where to buy it. Only for a card the
					     deck is actually short of (Card level, like the headline). The tooltip names the
					     printing, because "cheapest" can be a beta copy you did not have in mind. -->
					{#if offers}
						<span class="flex shrink-0 items-baseline gap-2 text-xs">
							{#each MARKETPLACES as marketplace (marketplace)}
								{@const offer = offers[marketplace]}
								{#if offer}
									<a
										href={MARKETPLACE_INFO[marketplace].url(offer.productId)}
										target="_blank"
										rel="noopener noreferrer"
										title="{MARKETPLACE_INFO[marketplace].name}, each — {printTreatment(
											offer.printing
										) === 'beta'
											? 'beta'
											: 'retail'} printing #{offer.printing.collectorNumber}"
										class="font-mono text-muted tabular-nums transition-colors hover:text-neon"
										>{formatMoney(offer.amount, MARKETPLACE_INFO[marketplace].currency)}<span
											class="sr-only"
											>, {MARKETPLACE_INFO[marketplace].name}, opens in a new tab</span
										></a
									>
								{/if}
							{/each}
						</span>
					{/if}

					<span
						class="shrink-0 text-xs tabular-nums {short ? 'text-card-red' : 'text-neon-dim'}"
						title={row.scope === 'printing'
							? short
								? `Missing ${row.missing} of the printing this deck chose`
								: "You own this deck's chosen printing"
							: short
								? `Missing ${row.missing}`
								: 'You have enough of this card'}
					>
						{row.owned}/{row.needed}
					</span>

					<!-- Always-visible −/+, unlike `QuantityStepper`'s hover reveal: nothing is being
					     obscured here (no card art underneath), and this tab exists to be clicked
					     through card by card. -->
					<span class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onclick={() => step(row, -1)}
							disabled={row.owned === 0}
							aria-label="One fewer {row.card.name} owned"
							class="size-5 rounded border border-edge text-muted transition-colors
								hover:border-card-red hover:text-card-red disabled:opacity-30">−</button
						>
						<button
							type="button"
							onclick={() => step(row, 1)}
							aria-label="One more {row.card.name} owned"
							class="size-5 rounded border border-edge text-muted transition-colors
								hover:border-neon-dim hover:text-neon">+</button
						>
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
