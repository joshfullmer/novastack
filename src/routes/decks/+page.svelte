<script lang="ts">
	/**
	 * "My Decks" — `docs/spec/deckbuilder.md` §8. Row operations (rename, duplicate, delete,
	 * change visibility) all live behind a per-row "⋯" menu, no need to open the deck. The
	 * Explore tab (§9) is still Phase 2.
	 */
	import { enhance } from '$app/forms';
	import CardImage from '#lib/components/CardImage.svelte';
	import { cardBySlug } from '#lib/decks/deck-state.svelte.js';
	import { deckSizeStatus, MAX_DECK_SIZE, MIN_DECK_SIZE } from '#lib/decks/legality.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';

	let { data } = $props();

	let openMenuId = $state<string | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');

	let deleteDialogEl: HTMLDialogElement;
	let deleteTarget = $state<{ id: string; name: string } | null>(null);

	function startRename(deck: { id: string; name: string }) {
		renamingId = deck.id;
		renameValue = deck.name;
		openMenuId = null;
	}

	function openDeleteDialog(deck: { id: string; name: string }) {
		deleteTarget = deck;
		openMenuId = null;
		deleteDialogEl.showModal();
	}
</script>

<svelte:head>
	<title>My decks — novastack</title>
</svelte:head>

<div class="mx-auto max-w-3xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-xl font-semibold text-bright">My decks</h1>
		<form method="POST" action="/decks/new">
			<button
				type="submit"
				class="rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void hover:bg-neon-dim"
			>
				+ New deck
			</button>
		</form>
	</div>

	{#if data.decks.length === 0}
		<p class="text-sm text-muted">No decks yet — create one to get started.</p>
	{:else}
		<ul class="divide-y divide-edge">
			{#each data.decks as deck (deck.id)}
				<li class="flex items-center gap-2 rounded-md px-2 py-3 hover:bg-raised">
					{#if renamingId === deck.id}
						<form
							method="POST"
							action="?/rename"
							use:enhance={() => {
								renamingId = null;
							}}
							class="flex min-w-0 flex-1 items-center gap-4"
						>
							<div class="flex shrink-0 gap-1">
								{#each deck.legendSlugs as slug (slug)}
									{@const legend = cardBySlug(slug)}
									{#if legend}
										<div class="size-10 overflow-hidden rounded border border-edge">
											<CardImage
												printingId={legend.printings[0].id}
												thumbhash={legend.printings[0].thumbhash}
												color={legend.color}
												alt={legend.name}
												sizes="40px"
											/>
										</div>
									{/if}
								{/each}
							</div>
							<input type="hidden" name="deckId" value={deck.id} />
							<!-- Triggered by an explicit "Rename" click, not on page load — the whole point is
							     focusing the field the user just asked to edit. -->
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								name="name"
								bind:value={renameValue}
								onkeydown={(event) => {
									if (event.key === 'Escape') renamingId = null;
								}}
								onblur={(event) => event.currentTarget.form?.requestSubmit()}
								class="min-w-0 flex-1 rounded border border-edge bg-void px-2 py-1 text-sm
									text-bright"
								autofocus
							/>
						</form>
					{:else}
						<a
							href="/decks/{deck.id}"
							class="flex min-w-0 flex-1 items-center gap-4 rounded-md py-1"
						>
							<div class="flex shrink-0 gap-1">
								{#each deck.legendSlugs as slug (slug)}
									{@const legend = cardBySlug(slug)}
									{#if legend}
										<div class="size-10 overflow-hidden rounded border border-edge">
											<CardImage
												printingId={legend.printings[0].id}
												thumbhash={legend.printings[0].thumbhash}
												color={legend.color}
												alt={legend.name}
												sizes="40px"
											/>
										</div>
									{/if}
								{/each}
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-bright">{deck.name}</p>
								<p class="text-xs text-muted tabular-nums">
									<span
										class={SIZE_STATUS_TONE[deckSizeStatus(deck.cardCount)]}
										title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards">{deck.cardCount}</span
									>
									cards
									{#if deck.savedAt}
										· saved {deck.savedAt.toLocaleDateString()}
									{/if}
								</p>
							</div>
						</a>
					{/if}

					<span
						class="shrink-0 rounded-full border border-edge px-2 py-0.5 text-xs text-muted capitalize"
					>
						{deck.visibility}
					</span>

					<div class="relative shrink-0">
						<button
							type="button"
							aria-label="Deck actions"
							onclick={() => (openMenuId = openMenuId === deck.id ? null : deck.id)}
							class="rounded-md px-2 py-1.5 text-muted hover:bg-surface hover:text-bright"
						>
							⋯
						</button>
						{#if openMenuId === deck.id}
							<button
								type="button"
								aria-label="Close deck actions"
								onclick={() => (openMenuId = null)}
								class="fixed inset-0 z-10 cursor-default"
							></button>
							<div
								class="absolute right-0 z-20 mt-1 w-48 rounded-md border border-edge bg-shell p-1
									text-sm shadow-lg"
							>
								<button
									type="button"
									onclick={() => startRename(deck)}
									class="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-raised"
									>Rename</button
								>
								<form
									method="POST"
									action="?/duplicate"
									use:enhance={() => {
										openMenuId = null;
									}}
								>
									<input type="hidden" name="deckId" value={deck.id} />
									<button
										type="submit"
										class="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-raised"
										>Duplicate</button
									>
								</form>
								<form method="POST" action="?/visibility" use:enhance>
									<input type="hidden" name="deckId" value={deck.id} />
									<label
										class="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-body
											hover:bg-raised"
									>
										Visibility
										<select
											name="visibility"
											value={deck.visibility}
											onchange={(event) => {
												event.currentTarget.form?.requestSubmit();
												openMenuId = null;
											}}
											class="rounded border border-edge bg-void px-1 py-0.5 text-xs capitalize"
										>
											<option value="private">Private</option>
											<option value="unlisted">Unlisted</option>
											<option value="public">Public</option>
										</select>
									</label>
								</form>
								<div class="my-1 border-t border-edge"></div>
								<button
									type="button"
									onclick={() => openDeleteDialog(deck)}
									class="block w-full rounded px-2 py-1.5 text-left text-card-red hover:bg-raised"
									>Delete</button
								>
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<dialog
	bind:this={deleteDialogEl}
	onclose={() => (deleteTarget = null)}
	class="w-full max-w-sm rounded-lg border border-edge bg-shell p-4"
>
	{#if deleteTarget}
		<p class="text-sm text-body">
			Delete <span class="font-medium text-bright">{deleteTarget.name}</span>? This can't be undone.
		</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleteDialogEl.close();
			}}
			class="mt-4 flex justify-end gap-2"
		>
			<input type="hidden" name="deckId" value={deleteTarget.id} />
			<button
				type="button"
				onclick={() => deleteDialogEl.close()}
				class="rounded-md border border-edge px-3 py-1.5 text-sm text-body hover:border-neon
					hover:text-neon">Cancel</button
			>
			<button
				type="submit"
				class="rounded-md bg-card-red px-3 py-1.5 text-sm font-medium text-void
					hover:opacity-90">Delete</button
			>
		</form>
	{/if}
</dialog>
