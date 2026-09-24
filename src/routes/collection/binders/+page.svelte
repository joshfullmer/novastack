<script lang="ts">
	/**
	 * The owner's Binders. A **Binder** is a showcase: what is in it means "I want to display
	 * this", never "I own this" (`CONTEXT.md`) — which is why the Collection appears here only as a
	 * veil over cards with an Owned Count of zero, and never as a count or a control.
	 *
	 * Rendered as sheets rather than rows, because a Binder is an object you made rather than a
	 * record — the prototype's shelf, kept. Each preview is the Binder's whole first Page, gaps
	 * included: a Binder *is* an arrangement, and one cover card says nothing about it.
	 */
	import { enhance } from '$app/forms';
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import { dataset } from '#lib/cards/index.js';
	import { POCKETS_PER_PAGE } from '#lib/collection/binders.js';
	import { collection } from '#lib/collection/state.svelte.js';

	let { data, form } = $props();

	let creating = $state(false);
	let renaming = $state<string | null>(null);

	const printingById = new Map(
		dataset.cards.flatMap((card) =>
			card.printings.map((printing) => [printing.id, { card, printing }])
		)
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
			Arrange the cards you're proud of into pages. Share a binder by link — your collection itself
			stays private.
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
	<ul class="flex flex-wrap gap-6">
		{#each data.binders as binder (binder.id)}
			<li class="w-64">
				<a href="/collection/binders/{binder.id}" class="group/cover block">
					<!-- The whole first Page, as a 3×3 sheet: a Binder *is* an arrangement, so the preview
					     is the arrangement. Empty pockets included — the gaps are part of it. -->
					<div
						class="grid grid-cols-3 gap-1.5 rounded-lg border-2 border-edge bg-shell p-2
							transition-transform group-hover/cover:-translate-y-1 group-hover/cover:border-neon-dim"
					>
						{#each binder.firstPage as printingId, pocket (pocket)}
							{@const row = printingId ? printingById.get(printingId) : undefined}
							{#if row}
								<div
									class="rounded-md"
									class:card-veil={collection.quantityOf(row.printing.id) === 0}
								>
									<CardImage
										printingId={row.printing.id}
										thumbhash={row.printing.thumbhash}
										color={row.card.color}
										alt=""
										sizes="80px"
										class="rounded-md"
									/>
								</div>
							{:else}
								<div class="card-frame rounded-md border border-dashed border-edge/70"></div>
							{/if}
						{/each}
					</div>

					<p class="mt-2 truncate text-sm font-medium text-bright">{binder.name}</p>
					<p class="font-mono text-[0.65rem] text-muted tabular-nums">
						{binder.filled}/{binder.pageCount * POCKETS_PER_PAGE} pockets · {binder.pageCount}
						{binder.pageCount === 1 ? 'page' : 'pages'}
						{#if binder.visibility === 'shared'}· shared{/if}
					</p>
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
