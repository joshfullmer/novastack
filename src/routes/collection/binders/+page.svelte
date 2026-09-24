<script lang="ts">
	/**
	 * The owner's Binders. A **Binder** is a showcase: what is in it means "I want to display
	 * this", never "I own this" (`CONTEXT.md`). Nothing on this page reads the Collection.
	 *
	 * Rendered as covers rather than rows, because a Binder is an object you made rather than a
	 * record — the prototype's shelf, kept. A Binder's cover is its first filled Pocket, which is
	 * why a new one looks empty until you put something in it.
	 */
	import { enhance } from '$app/forms';
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import { dataset } from '#lib/cards/index.js';
	import { POCKETS_PER_PAGE } from '#lib/collection/binders.js';

	let { data, form } = $props();

	let creating = $state(false);
	let renaming = $state<string | null>(null);

	const printingById = new Map(
		dataset.cards.flatMap((card) => card.printings.map((printing) => [printing.id, { card, printing }]))
	);
</script>

<Meta
	title="Binders — novastack"
	description="Showcases of the cards you want to display."
	origin={data.origin}
	path="/collection/binders"
/>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div>
		<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Binders</p>
		<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">Show it off</h1>
		<p class="mt-2 max-w-xl text-sm text-muted">
			Arrange the cards you're proud of into pages. Share a binder by link — your collection
			itself stays private.
		</p>
	</div>

	{#if !creating}
		<button
			type="button"
			onclick={() => (creating = true)}
			class="rounded-lg border border-edge px-3.5 py-2 text-sm text-body transition-colors
				hover:border-neon-dim hover:text-neon">+ New binder</button
		>
	{/if}
</div>

{#if creating}
	<form
		method="POST"
		action="?/create"
		use:enhance
		class="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-shell px-4 py-3"
	>
		<input
			name="name"
			required
			maxlength="60"
			placeholder="Trade binder"
			class="min-w-48 flex-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
				placeholder:text-muted/60"
		/>
		<button
			type="submit"
			class="rounded-md border border-neon bg-neon px-3.5 py-2 text-sm text-void">Create</button
		>
		<button
			type="button"
			onclick={() => (creating = false)}
			class="px-2 py-2 text-sm text-muted hover:text-body">Cancel</button
		>
	</form>
{/if}

{#if form?.message}
	<p class="mb-4 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body">
		{form.message}
	</p>
{/if}

{#if data.binders.length === 0}
	<div class="mt-16 text-center">
		<p class="text-lg text-bright">No binders yet.</p>
		<p class="mx-auto mt-2 max-w-md text-sm text-balance text-muted">
			A binder is a page of pockets you arrange by hand — a trade list, a favourite artist, a set
			you're proud of finishing. It says nothing about what you own.
		</p>
	</div>
{:else}
	<ul class="flex flex-wrap gap-5">
		{#each data.binders as binder (binder.id)}
			{@const cover = binder.coverPrintingId ? printingById.get(binder.coverPrintingId) : undefined}
			<li class="w-44">
				<a href="/binders/{binder.id}" class="group/cover block">
					<div
						class="card-frame relative overflow-hidden rounded-lg border-2 border-edge
							transition-transform group-hover/cover:-translate-y-1 group-hover/cover:border-neon-dim"
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
							<p class="truncate text-sm font-medium text-bright">{binder.name}</p>
							<p class="font-mono text-[0.65rem] text-muted tabular-nums">
								{binder.filled}/{binder.pageCount * POCKETS_PER_PAGE} pockets
								{#if binder.visibility === 'shared'}· shared{/if}
							</p>
						</div>
					</div>
				</a>

				<div class="mt-2 flex items-center gap-2 text-xs">
					{#if renaming === binder.id}
						<form
							method="POST"
							action="?/rename"
							use:enhance={() => {
								renaming = null;
								return async ({ update }) => update();
							}}
							class="flex flex-1 items-center gap-1"
						>
							<input type="hidden" name="binderId" value={binder.id} />
							<input
								name="name"
								value={binder.name}
								required
								maxlength="60"
								class="min-w-0 flex-1 rounded border border-edge bg-surface px-2 py-1 text-body"
							/>
							<button type="submit" class="text-neon hover:text-bright">Save</button>
						</form>
					{:else}
						<button
							type="button"
							onclick={() => (renaming = binder.id)}
							class="text-muted hover:text-neon">Rename</button
						>

						<form method="POST" action="?/visibility" use:enhance>
							<input type="hidden" name="binderId" value={binder.id} />
							<input
								type="hidden"
								name="visibility"
								value={binder.visibility === 'shared' ? 'private' : 'shared'}
							/>
							<button type="submit" class="text-muted hover:text-neon">
								{binder.visibility === 'shared' ? 'Make private' : 'Share'}
							</button>
						</form>

						<form method="POST" action="?/delete" use:enhance class="ml-auto">
							<input type="hidden" name="binderId" value={binder.id} />
							<button type="submit" class="text-muted hover:text-card-red">Delete</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
