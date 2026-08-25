<script lang="ts">
	/**
	 * "My Decks" — `docs/spec/deckbuilder.md` §8. Row operations (rename, duplicate, delete,
	 * change visibility) all live behind a per-row "⋯" menu, no need to open the deck. List/Grid
	 * is a display toggle only — same data, same actions, either shape. The Explore tab (§9) is
	 * its own route (`/explore`), not a tab here.
	 */
	import { enhance } from '$app/forms';
	import CardImage from '#lib/components/CardImage.svelte';
	import { cardBySlug } from '#lib/decks/deck-state.svelte.js';
	import { deckSizeStatus, MAX_DECK_SIZE, MIN_DECK_SIZE } from '#lib/decks/legality.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';

	let { data } = $props();

	let deckView = $state<'list' | 'grid'>('list');

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

{#snippet renameForm(deck: { id: string }, sizeClass: string)}
	<form
		method="POST"
		action="?/rename"
		use:enhance={() => {
			renamingId = null;
		}}
		class="min-w-0 flex-1"
	>
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
			class="w-full rounded border border-edge bg-void px-2 py-1 {sizeClass} text-bright"
			autofocus
		/>
	</form>
{/snippet}

{#snippet actionsMenu(deck: { id: string; name: string; visibility: string })}
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
				class="absolute right-0 z-20 mt-1 w-48 rounded-md border border-edge bg-shell p-1 text-sm
					shadow-lg"
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
{/snippet}

<svelte:head>
	<title>My decks — novastack</title>
</svelte:head>

<div class="mx-auto max-w-5xl p-6">
	<div class="mb-6 flex items-center justify-between gap-4">
		<h1 class="text-xl font-semibold text-bright">My decks</h1>
		<div class="flex items-center gap-2">
			<div class="flex overflow-hidden rounded-md border border-edge text-xs">
				<button
					type="button"
					onclick={() => (deckView = 'list')}
					class="px-2 py-1"
					class:bg-raised={deckView === 'list'}
					class:text-bright={deckView === 'list'}
					class:text-muted={deckView !== 'list'}>List</button
				>
				<button
					type="button"
					onclick={() => (deckView = 'grid')}
					class="px-2 py-1"
					class:bg-raised={deckView === 'grid'}
					class:text-bright={deckView === 'grid'}
					class:text-muted={deckView !== 'grid'}>Grid</button
				>
			</div>
			<form method="POST" action="/decks/new">
				<button
					type="submit"
					class="rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void hover:bg-neon-dim"
				>
					+ New deck
				</button>
			</form>
		</div>
	</div>

	{#if data.decks.length === 0}
		<p class="text-sm text-muted">No decks yet — create one to get started.</p>
	{:else if deckView === 'grid'}
		<ul class="grid grid-cols-2 gap-4 lg:grid-cols-3">
			{#each data.decks as deck (deck.id)}
				<li class="overflow-hidden rounded-lg border border-edge bg-shell">
					<a href="/decks/{deck.id}" class="flex gap-1 bg-void p-2">
						{#each deck.legendSlugs as slug (slug)}
							{@const legend = cardBySlug(slug)}
							{#if legend}
								<div class="card-frame flex-1 overflow-hidden rounded">
									<CardImage
										printingId={legend.printings[0].id}
										thumbhash={legend.printings[0].thumbhash}
										color={legend.color}
										alt={legend.name}
										sizes="200px"
									/>
								</div>
							{/if}
						{/each}
					</a>
					<div class="p-3">
						{#if renamingId === deck.id}
							{@render renameForm(deck, 'text-base font-semibold')}
						{:else}
							<a
								href="/decks/{deck.id}"
								class="block truncate text-base font-semibold text-bright hover:text-neon"
								>{deck.name}</a
							>
						{/if}
						<p class="mt-1 text-xs text-muted tabular-nums">
							<span
								class={SIZE_STATUS_TONE[deckSizeStatus(deck.cardCount)]}
								title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards">{deck.cardCount}</span
							>
							cards {#if deck.savedAt}· saved {deck.savedAt.toLocaleDateString()}{/if}
						</p>
						<div class="mt-2 flex items-center justify-between text-xs text-muted">
							<span class="rounded-full border border-edge px-2 py-0.5 capitalize"
								>{deck.visibility}</span
							>
							{@render actionsMenu(deck)}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each data.decks as deck (deck.id)}
				<li class="flex items-center gap-4 rounded-lg border border-edge bg-shell p-4">
					<div class="flex shrink-0 gap-2">
						{#each deck.legendSlugs as slug (slug)}
							{@const legend = cardBySlug(slug)}
							{#if legend}
								<div class="size-20 overflow-hidden rounded-md border border-edge">
									<CardImage
										printingId={legend.printings[0].id}
										thumbhash={legend.printings[0].thumbhash}
										color={legend.color}
										alt={legend.name}
										sizes="80px"
									/>
								</div>
							{/if}
						{/each}
					</div>
					{#if renamingId === deck.id}
						{@render renameForm(deck, 'text-lg font-semibold')}
					{:else}
						<a href="/decks/{deck.id}" class="min-w-0 flex-1">
							<p class="truncate text-lg font-semibold text-bright hover:text-neon">{deck.name}</p>
							<p class="mt-1 text-sm text-muted tabular-nums">
								<span
									class={SIZE_STATUS_TONE[deckSizeStatus(deck.cardCount)]}
									title="{MIN_DECK_SIZE}–{MAX_DECK_SIZE} cards">{deck.cardCount}</span
								>
								cards {#if deck.savedAt}· saved {deck.savedAt.toLocaleDateString()}{/if}
							</p>
						</a>
					{/if}
					<div class="flex shrink-0 items-center gap-3 text-sm text-muted">
						<span class="rounded-full border border-edge px-3 py-1 capitalize"
							>{deck.visibility}</span
						>
						{@render actionsMenu(deck)}
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
