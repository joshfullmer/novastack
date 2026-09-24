<script lang="ts">
	/**
	 * What the viewer is short of, to build the Deck in front of them — and a way to put it on a
	 * Wantlist.
	 *
	 * A component rather than markup inside the deck view, because it has real behaviour (a fetch,
	 * a menu, an optimistic confirmation) and the deck view is already a thousand lines. It reads
	 * the Collection from the client store like every other collection surface: the deck view is a
	 * public, non-personalised page, so per-viewer figures cannot come from its `load`.
	 *
	 * **Silent until there's a Collection to compare against, and quiet for a complete deck.**
	 * Someone browsing a public deck has none, and a confident claim about what they're missing —
	 * rendered server-side, before the store has even asked — would be wrong for the first second of
	 * every page load. A deck you *can* build gets one line saying so, because that is worth
	 * knowing.
	 *
	 * The Missing rule itself lives in `#lib/collection/missing.ts` — Card level, per Deck,
	 * indifferent to the Collecting Goal. See its comment for why each of those is deliberate.
	 */
	import { collection } from '#lib/collection/state.svelte.js';
	import { missingForDeck, wantedPrintingId, type NeededCard } from '#lib/collection/missing.js';
	import type { WantlistSummary } from '#lib/collection/wantlists.js';

	let { entries }: { entries: readonly NeededCard[] } = $props();

	$effect(() => void collection.load());

	const report = $derived(missingForDeck(entries, (id) => collection.quantityOf(id)));

	/** Menu state. `wantlists` is `null` until fetched, so "none yet" is distinguishable. */
	let open = $state(false);
	let wantlists = $state<WantlistSummary[] | null>(null);
	let busy = $state(false);
	let failure = $state<string | null>(null);
	let added = $state<{ wantlistId: string; copies: number } | null>(null);
	let newName = $state('');

	async function openMenu() {
		open = true;
		failure = null;
		if (wantlists !== null) return;

		try {
			const response = await fetch('/api/collection/wantlists');
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			// Asserted rather than parsed, matching `state.svelte.ts`: this is our own endpoint
			// answering our own request, and the only consumer of the shape is the markup below.
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

		const items = report.cards
			.map(({ card, missing }) => ({ printingId: wantedPrintingId(card), quantity: missing }))
			.filter((item): item is { printingId: string; quantity: number } => Boolean(item.printingId));

		try {
			const response = await fetch('/api/collection/wantlists', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...target, items })
			});
			if (!response.ok) throw new Error(await response.text());

			const result = (await response.json()) as { wantlistId: string };
			added = { wantlistId: result.wantlistId, copies: report.copyCount };
			open = false;
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
</script>

<!--
	Gated on `editable` — the store having actually loaded a Collection — rather than on "not signed
	out". The store can't know either way until its fetch lands, so the looser test rendered a
	confident "you're missing 18 cards" into the server HTML for signed-out visitors, then removed it
	once the 401 arrived. Appearing a beat late is the honest version of that.
-->
{#if collection.editable}
	{#if report.complete}
		<p class="mb-4 rounded-md border border-neon-dim/40 bg-neon/5 px-3 py-2 text-sm text-neon-dim">
			You own every card in this deck.
		</p>
	{:else}
		<div class="mb-4 rounded-md border border-edge bg-surface p-3">
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<p class="text-sm font-medium text-bright">
					You're missing {report.cardCount}
					{report.cardCount === 1 ? 'card' : 'cards'}
					<span class="text-muted tabular-nums">· {report.copyCount} copies</span>
				</p>

				{#if added}
					<a
						href="/collection/wantlists/{added.wantlistId}"
						class="ml-auto text-xs text-neon hover:text-bright"
						>Added {added.copies} copies — open wantlist ›</a
					>
				{:else}
					<button
						type="button"
						onclick={openMenu}
						class="ml-auto rounded border border-edge px-2 py-1 text-xs text-muted
							transition-colors hover:border-neon-dim hover:text-neon">Add to wantlist</button
					>
				{/if}
			</div>

			<!-- The cards themselves, compactly: a count alone tells you there's a problem, and this
			     tells you what it is. Ordered as the deck lists them, not by shortfall — you read it
			     against the deck. -->
			<ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
				{#each report.cards as card (card.card.slug)}
					<li>
						<span class="font-mono text-bright tabular-nums">{card.missing}×</span>
						{card.card.name}{#if card.owned > 0}<span class="text-muted/60"
								>&nbsp;(have {card.owned}/{card.needed})</span
							>{/if}
					</li>
				{/each}
			</ul>

			{#if open}
				<div class="mt-3 border-t border-edge pt-3">
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
								onclick={() => (open = false)}
								class="text-xs text-muted hover:text-body">Cancel</button
							>
						</form>
					{/if}

					{#if failure}
						<p class="mt-2 text-xs text-card-red">{failure}</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
{/if}
