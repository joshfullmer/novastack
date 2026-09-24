<script lang="ts">
	/**
	 * The owner's Wantlists. A **Wantlist** describes cards that are absent (`CONTEXT.md`) — the
	 * deliberate opposite of a Binder, which arranges cards you have and want to show.
	 *
	 * Rendered as rows rather than as the Binders' shelf of sheets, and that difference is the
	 * point: a Binder is an object you arranged, so it gets a picture of itself; a Wantlist is a
	 * request, so it gets a count and a name. Nothing here reads the Collection: what you want is a
	 * decision, not a function of what you own.
	 */
	import { enhance } from '$app/forms';
	import Meta from '#lib/components/Meta.svelte';

	let { data, form } = $props();

	let creating = $state(false);
	let renaming = $state<string | null>(null);
</script>

<Meta
	title="Wantlists — novastack"
	description="What you're still looking for."
	origin={data.origin}
	path="/collection/wantlists"
/>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div>
		<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Wantlists</p>
		<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">What you're after</h1>
		<p class="mt-2 max-w-xl text-sm text-muted">
			A list of cards you're looking for, with how many of each. Share one by link and someone can
			see exactly what to bring.
		</p>
	</div>

	{#if !creating}
		<button
			type="button"
			onclick={() => (creating = true)}
			class="rounded-lg border border-edge px-3.5 py-2 text-sm text-body transition-colors
				hover:border-neon-dim hover:text-neon">+ New wantlist</button
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
			placeholder="Chasing epics"
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

{#if data.wantlists.length === 0}
	<div class="mt-16 text-center">
		<p class="text-lg text-bright">No wantlists yet.</p>
		<p class="mx-auto mt-2 max-w-md text-sm text-balance text-muted">
			A wantlist is what you're hunting: the cards you don't have and how many you need. Keep one
			for trades, one per deck you're building — whatever you'd otherwise keep in your head.
		</p>
	</div>
{:else}
	<ul class="max-w-2xl divide-y divide-edge/70 overflow-hidden rounded-xl border border-edge">
		{#each data.wantlists as wantlist (wantlist.id)}
			<li class="flex flex-wrap items-center gap-x-3 gap-y-2 bg-shell px-4 py-3">
				{#if renaming === wantlist.id}
					<form
						method="POST"
						action="?/rename"
						use:enhance={() => {
							renaming = null;
							return async ({ update }) => update();
						}}
						class="flex flex-1 items-center gap-2"
					>
						<input type="hidden" name="wantlistId" value={wantlist.id} />
						<input
							name="name"
							value={wantlist.name}
							required
							maxlength="60"
							class="min-w-0 flex-1 rounded border border-edge bg-surface px-2 py-1 text-sm text-body"
						/>
						<button type="submit" class="text-sm text-neon hover:text-bright">Save</button>
					</form>
				{:else}
					<a
						href="/collection/wantlists/{wantlist.id}"
						class="min-w-0 flex-1 truncate font-medium text-bright transition-colors hover:text-neon"
						>{wantlist.name}</a
					>

					<span class="shrink-0 font-mono text-xs text-muted tabular-nums">
						{wantlist.entries}
						{wantlist.entries === 1 ? 'card' : 'cards'} · {wantlist.copies}
						{wantlist.copies === 1 ? 'copy' : 'copies'}
					</span>

					{#if wantlist.visibility === 'shared'}
						<span class="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[0.6rem] text-muted"
							>shared</span
						>
					{/if}

					<div class="flex shrink-0 items-center gap-2 text-xs">
						<button
							type="button"
							onclick={() => (renaming = wantlist.id)}
							class="text-muted hover:text-neon">Rename</button
						>

						<form method="POST" action="?/visibility" use:enhance>
							<input type="hidden" name="wantlistId" value={wantlist.id} />
							<input
								type="hidden"
								name="visibility"
								value={wantlist.visibility === 'shared' ? 'private' : 'shared'}
							/>
							<button type="submit" class="text-muted hover:text-neon">
								{wantlist.visibility === 'shared' ? 'Make private' : 'Share'}
							</button>
						</form>

						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="wantlistId" value={wantlist.id} />
							<button type="submit" class="text-muted hover:text-card-red">Delete</button>
						</form>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
