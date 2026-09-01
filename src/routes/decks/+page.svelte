<script lang="ts">
	/**
	 * "My Decks" — `docs/spec/deckbuilder.md` §8. Row operations (rename, duplicate, delete,
	 * change visibility) all live behind a per-row "⋯" menu, no need to open the deck. List/Grid
	 * is a display toggle only — same data, same actions, either shape. The Explore tab (§9) is
	 * its own route (`/explore`), not a tab here.
	 *
	 * Decklist Folders (`.scratch/decklist-folders/map.md`) fold in here: folder rows/tiles are
	 * always listed before deck rows/tiles, each group alphabetical — matching the real Moxfield
	 * "Your Decks" table the design was checked against. Clicking a folder drills into it
	 * client-side (`currentFolderId`, not a URL — the dedicated `/decks/folders/[id]` route is
	 * what a *shared* link points at); a breadcrumb goes back out. Moving a deck is native
	 * HTML5 drag-and-drop onto a folder (in) or the breadcrumb (out) — confirmed explicitly with
	 * the user as the *only* move mechanism, no menu.
	 */
	import { enhance } from '$app/forms';
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import { cardBySlug } from '#lib/decks/deck-state.svelte.js';
	import {
		deckSizeStatus,
		LEGEND_SLOTS,
		MAX_DECK_SIZE,
		MIN_DECK_SIZE
	} from '#lib/decks/legality.js';
	import { SIZE_STATUS_TONE } from '#lib/decks/status-tone.js';
	import { cookieState } from '#lib/cookie-state.svelte.js';

	let { data } = $props();

	// Grid cards always render this many art slots, even for missing Legends — otherwise a
	// deck with fewer than 3 Legends gets a shorter art strip, and every card in the grid ends
	// up a different height.
	const legendSlots = Array.from({ length: LEGEND_SLOTS }, (_, index) => index);

	// Shared with /explore — "how I like browsing a list of decks" is one preference, not two.
	// Server-rendered from a cookie (`data.deckView`, read in `+page.server.ts`) rather than
	// `localStorage`: this page isn't prerendered, so the server can pick the right branch on
	// the very first render — no flash, and no need to render the other one just in case.
	// svelte-ignore state_referenced_locally
	const deckView = cookieState('decks-list-view', data.deckView);

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

	// Folders — client-only drill-in state; a page reload always starts back at the root, which
	// is fine, since the dedicated `/decks/folders/[id]` route is what a shared link points at.
	let currentFolderId = $state<string | null>(null);
	let draggingDeckId = $state<string | null>(null);
	let dragOverTarget = $state<string | null | 'breadcrumb'>(null);
	let creatingFolder = $state(false);
	let newFolderName = $state('');
	let renamingFolderId = $state<string | null>(null);
	let renameFolderValue = $state('');
	let openFolderMenuId = $state<string | null>(null);

	let moveFormEl: HTMLFormElement;
	let moveDeckIdInput: HTMLInputElement;
	let moveFolderIdInput: HTMLInputElement;

	// Folders always sort before decks, each group alphabetical — matches Moxfield's own table.
	const sortedFolders = $derived([...data.folders].sort((a, b) => a.name.localeCompare(b.name)));
	const currentFolder = $derived(data.folders.find((f) => f.id === currentFolderId) ?? null);
	function decksInFolder(folderId: string | null) {
		return data.decks.filter((deck) => deck.folderId === folderId);
	}
	const visibleDecks = $derived(decksInFolder(currentFolderId));

	function submitMove(deckId: string, folderId: string | null) {
		moveDeckIdInput.value = deckId;
		moveFolderIdInput.value = folderId ?? '';
		moveFormEl.requestSubmit();
	}

	function dropOnFolder(folderId: string) {
		if (draggingDeckId) submitMove(draggingDeckId, folderId);
		draggingDeckId = null;
		dragOverTarget = null;
	}

	function dropOnBreadcrumb() {
		if (draggingDeckId) submitMove(draggingDeckId, null);
		draggingDeckId = null;
		dragOverTarget = null;
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

{#snippet renameFolderForm(folder: { id: string })}
	<form
		method="POST"
		action="?/renameFolder"
		use:enhance={() => {
			renamingFolderId = null;
		}}
		class="min-w-0 flex-1"
	>
		<input type="hidden" name="folderId" value={folder.id} />
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="text"
			name="name"
			bind:value={renameFolderValue}
			autofocus
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => {
				if (event.key === 'Escape') renamingFolderId = null;
			}}
			onblur={(event) => event.currentTarget.form?.requestSubmit()}
			class="w-full rounded border border-edge bg-void px-2 py-1 text-lg font-semibold text-bright"
		/>
	</form>
{/snippet}

{#snippet folderMenu(folder: { id: string; name: string })}
	<div class="relative shrink-0">
		<button
			type="button"
			aria-label="Manage {folder.name}"
			onclick={() => (openFolderMenuId = openFolderMenuId === folder.id ? null : folder.id)}
			class="rounded-md px-2 py-1.5 text-muted hover:bg-raised hover:text-bright"
		>
			⋯
		</button>
		{#if openFolderMenuId === folder.id}
			<button
				type="button"
				aria-label="Close folder actions"
				onclick={() => (openFolderMenuId = null)}
				class="fixed inset-0 z-10 cursor-default"
			></button>
			<div
				class="absolute right-0 z-20 mt-1 w-36 rounded-md border border-edge bg-shell p-1 text-xs
					shadow-lg"
			>
				<button
					type="button"
					onclick={() => {
						renamingFolderId = folder.id;
						renameFolderValue = folder.name;
						openFolderMenuId = null;
					}}
					class="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-raised"
				>
					Rename
				</button>
				<form
					method="POST"
					action="?/deleteFolder"
					use:enhance={() => {
						openFolderMenuId = null;
					}}
				>
					<input type="hidden" name="folderId" value={folder.id} />
					<button
						type="submit"
						onclick={(event) => {
							if (!confirm(`Delete "${folder.name}"? Decks inside become ungrouped.`)) {
								event.preventDefault();
							}
						}}
						class="block w-full rounded px-2 py-1.5 text-left text-card-red hover:bg-raised"
					>
						Delete
					</button>
				</form>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet folderRow(folder: { id: string; name: string; visibility: 'private' | 'unlisted' })}
	<li
		role="group"
		aria-label="{folder.name} folder"
		ondragover={(event) => {
			event.preventDefault();
			dragOverTarget = folder.id;
		}}
		ondragleave={() => (dragOverTarget = null)}
		ondrop={() => dropOnFolder(folder.id)}
		class="flex items-center gap-4 rounded-lg border border-edge bg-shell p-4"
		class:border-neon={dragOverTarget === folder.id}
	>
		{#if renamingFolderId === folder.id}
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<span class="text-xl">📁</span>
				{@render renameFolderForm(folder)}
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (currentFolderId = folder.id)}
				class="flex min-w-0 flex-1 items-center gap-3 text-left"
			>
				<span class="text-xl">📁</span>
				<span class="truncate text-lg font-semibold text-bright">{folder.name}</span>
				<span class="shrink-0 text-sm text-muted tabular-nums"
					>({decksInFolder(folder.id).length})</span
				>
			</button>
		{/if}
		{#if folder.visibility === 'unlisted'}
			<span class="rounded-full border border-edge px-3 py-1 text-xs text-muted capitalize"
				>Unlisted</span
			>
		{/if}
		{@render folderMenu(folder)}
	</li>
{/snippet}

{#snippet folderTile(folder: { id: string; name: string; visibility: 'private' | 'unlisted' })}
	<li class="group relative list-none">
		<div
			role="button"
			tabindex="0"
			onclick={() => (currentFolderId = folder.id)}
			onkeydown={(event) => event.key === 'Enter' && (currentFolderId = folder.id)}
			ondragover={(event) => {
				event.preventDefault();
				dragOverTarget = folder.id;
			}}
			ondragleave={() => (dragOverTarget = null)}
			ondrop={() => dropOnFolder(folder.id)}
			class="flex h-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg
				border border-edge bg-shell px-3 py-6 text-center"
			class:border-neon={dragOverTarget === folder.id}
		>
			<span class="text-2xl">📁</span>
			{#if renamingFolderId === folder.id}
				{@render renameFolderForm(folder)}
			{:else}
				<span class="truncate text-sm font-medium text-bright">{folder.name}</span>
			{/if}
			<span class="text-xs text-muted tabular-nums">{decksInFolder(folder.id).length} decks</span>
			{#if folder.visibility === 'unlisted'}
				<span class="rounded-full border border-edge px-2 py-0.5 text-xs text-muted capitalize"
					>Unlisted</span
				>
			{/if}
		</div>
		<div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100">
			{@render folderMenu(folder)}
		</div>
	</li>
{/snippet}

<Meta
	title="My decks — novastack"
	description="Build, manage, and share Cyberpunk TCG decks on novastack."
	origin={data.origin}
	path="/decks"
/>

<!-- The extra plain wrapper matters: `<main>` (root layout) is a column flex container, and a
     `mx-auto max-w-…` box that is a *direct* flex child has its stretch behavior disabled by its
     own auto margins — it shrink-wraps to content width instead of filling to `max-w`, which is
     exactly what made switching List/Grid visibly resize the page. See `/decks/[id]` and
     `/cards` for the same fix. -->
<div>
	<div class="mx-auto max-w-5xl p-6">
		<div class="mb-6 flex items-center justify-between gap-4">
			<h1 class="text-xl font-semibold text-bright">My decks</h1>
			<div class="flex items-center gap-2">
				<div class="flex overflow-hidden rounded-md border border-edge text-xs">
					<button
						type="button"
						onclick={() => (deckView.value = 'list')}
						class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
						class:bg-raised={deckView.value === 'list'}
						class:text-bright={deckView.value === 'list'}
						class:text-muted={deckView.value !== 'list'}>List</button
					>
					<button
						type="button"
						onclick={() => (deckView.value = 'grid')}
						class="px-2 py-1 transition-colors hover:bg-raised/60 hover:text-bright"
						class:bg-raised={deckView.value === 'grid'}
						class:text-bright={deckView.value === 'grid'}
						class:text-muted={deckView.value !== 'grid'}>Grid</button
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

		<div class="mb-4 flex items-center gap-2 text-sm">
			<button
				type="button"
				onclick={() => (currentFolderId = null)}
				ondragover={(event) => {
					if (currentFolder) {
						event.preventDefault();
						dragOverTarget = 'breadcrumb';
					}
				}}
				ondragleave={() => (dragOverTarget = null)}
				ondrop={dropOnBreadcrumb}
				class="rounded px-1 text-muted hover:text-bright"
				class:text-bright={!currentFolder}
				class:font-medium={!currentFolder}
				class:border={dragOverTarget === 'breadcrumb'}
				class:border-neon={dragOverTarget === 'breadcrumb'}
			>
				All decks
			</button>
			{#if currentFolder}
				<span class="text-muted">/</span>
				<span class="font-medium text-bright">📁 {currentFolder.name}</span>
				<form method="POST" action="?/folderVisibility" use:enhance>
					<input type="hidden" name="folderId" value={currentFolder.id} />
					<select
						name="visibility"
						value={currentFolder.visibility}
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
						class="ml-2 rounded border border-edge bg-void px-1 py-0.5 text-xs text-muted"
					>
						<option value="private">Private</option>
						<option value="unlisted">Unlisted</option>
					</select>
				</form>
				{#if currentFolder.visibility === 'unlisted'}
					<button
						type="button"
						title="Copy share link"
						onclick={() =>
							navigator.clipboard.writeText(`${data.origin}/decks/folders/${currentFolder.id}`)}
						class="text-xs text-neon hover:underline"
					>
						🔗 Copy share link
					</button>
				{/if}
			{/if}
		</div>

		{#if !currentFolder && sortedFolders.length === 0 && data.decks.length === 0}
			<p class="text-sm text-muted">No decks yet — create one to get started.</p>
		{:else if deckView.value === 'grid'}
			<ul class="grid grid-cols-2 gap-4 lg:grid-cols-3">
				{#if !currentFolder}
					{#each sortedFolders as folder (folder.id)}
						{@render folderTile(folder)}
					{/each}
				{/if}
				{#each visibleDecks as deck (deck.id)}
					<li
						draggable="true"
						ondragstart={() => (draggingDeckId = deck.id)}
						ondragend={() => (draggingDeckId = null)}
						class="cursor-grab overflow-hidden rounded-lg border border-edge bg-shell
							active:cursor-grabbing"
						class:opacity-40={draggingDeckId === deck.id}
					>
						<a href="/decks/{deck.id}" class="flex gap-1 bg-void p-2">
							{#each legendSlots as slot (slot)}
								{@const slug = deck.legendSlugs[slot]}
								{@const legend = slug ? cardBySlug(slug) : null}
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
								{:else}
									<div
										class="flex card-frame flex-1 items-center justify-center rounded border
										border-edge bg-surface text-muted"
									>
										—
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
				{#if !currentFolder}
					<li class="list-none">
						{#if creatingFolder}
							<form
								method="POST"
								action="?/createFolder"
								use:enhance={() => {
									creatingFolder = false;
									newFolderName = '';
								}}
								class="h-full"
							>
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="text"
									name="name"
									bind:value={newFolderName}
									placeholder="Folder name"
									autofocus
									onblur={(event) => {
										if (newFolderName.trim()) event.currentTarget.form?.requestSubmit();
										else creatingFolder = false;
									}}
									onkeydown={(event) => event.key === 'Escape' && (creatingFolder = false)}
									class="h-full w-full rounded-lg border border-edge bg-void px-3 py-6 text-center
										text-sm text-bright"
								/>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (creatingFolder = true)}
								class="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg
									border border-dashed border-edge px-3 py-6 text-center text-sm text-muted
									hover:border-neon hover:text-neon"
							>
								<span class="text-2xl">+</span>
								New folder
							</button>
						{/if}
					</li>
				{/if}
			</ul>
		{:else}
			<ul class="flex flex-col gap-3">
				{#if !currentFolder}
					{#each sortedFolders as folder (folder.id)}
						{@render folderRow(folder)}
					{/each}
				{/if}
				{#each visibleDecks as deck (deck.id)}
					<li
						draggable="true"
						ondragstart={() => (draggingDeckId = deck.id)}
						ondragend={() => (draggingDeckId = null)}
						class="flex items-center gap-4 rounded-lg border border-edge bg-shell p-4
							active:cursor-grabbing"
						class:opacity-40={draggingDeckId === deck.id}
					>
						<div class="flex shrink-0 gap-2">
							{#each legendSlots as slot (slot)}
								{@const slug = deck.legendSlugs[slot]}
								{@const legend = slug ? cardBySlug(slug) : null}
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
								{:else}
									<div
										class="flex size-20 items-center justify-center rounded-md border border-edge
											bg-surface text-muted"
									>
										—
									</div>
								{/if}
							{/each}
						</div>
						{#if renamingId === deck.id}
							{@render renameForm(deck, 'text-lg font-semibold')}
						{:else}
							<a href="/decks/{deck.id}" class="min-w-0 flex-1">
								<p class="truncate text-lg font-semibold text-bright hover:text-neon">
									{deck.name}
								</p>
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
			{#if !currentFolder}
				{#if creatingFolder}
					<form
						method="POST"
						action="?/createFolder"
						use:enhance={() => {
							creatingFolder = false;
							newFolderName = '';
						}}
						class="mt-3"
					>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							type="text"
							name="name"
							bind:value={newFolderName}
							placeholder="Folder name"
							autofocus
							onblur={(event) => {
								if (newFolderName.trim()) event.currentTarget.form?.requestSubmit();
								else creatingFolder = false;
							}}
							onkeydown={(event) => event.key === 'Escape' && (creatingFolder = false)}
							class="rounded-md border border-edge bg-void px-3 py-1.5 text-sm text-bright"
						/>
					</form>
				{:else}
					<button
						type="button"
						onclick={() => (creatingFolder = true)}
						class="mt-3 rounded-md border border-dashed border-edge px-3 py-1.5 text-sm text-muted
							hover:border-neon hover:text-neon"
					>
						+ New folder
					</button>
				{/if}
			{/if}
		{/if}

		{#if currentFolder && visibleDecks.length === 0}
			<p class="mt-3 text-sm text-muted italic">Drag decks here from All decks.</p>
		{/if}
	</div>
</div>

<!-- Hidden, permanent form for the drag-and-drop move — see `submitMove`. Not a per-row <form>
     since the move target is decided by whichever folder/breadcrumb the drop landed on, not by
     a specific row's own DOM. -->
<form method="POST" action="?/move" use:enhance bind:this={moveFormEl} class="hidden">
	<input type="hidden" name="deckId" bind:this={moveDeckIdInput} />
	<input type="hidden" name="folderId" bind:this={moveFolderIdInput} />
</form>

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
