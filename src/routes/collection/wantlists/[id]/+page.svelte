<script lang="ts">
	/**
	 * One Wantlist — the cards you're after, and how many of each.
	 *
	 * **Rows, not a grid, and that's the whole difference from a Binder.** A Binder is an
	 * arrangement, so it's shown as one; a Wantlist is a request you hand to someone, so it reads
	 * top to bottom with the quantity and the reason beside each card. Newest first, because you
	 * add what you're currently chasing (`getWantlistEntries`).
	 *
	 * **The Collection is shown but never consulted for what belongs here.** A card you own can
	 * still be wanted — a second copy, a nicer one, a beta printing — so owning something neither
	 * removes it nor stops you adding it. The count is there because it's the first thing you'd ask.
	 *
	 * Quantities are **absolute** in every form: the stepper submits the number it wants to end up
	 * at, so a double click can't compound, and zero removes the entry, which is what "Remove" does.
	 * Every control is a real form, so the page works with JavaScript off.
	 */
	import { enhance } from '$app/forms';
	import { dataset } from '#lib/cards/index.js';
	import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import { inGoal } from '#lib/collection/goal.js';
	import {
		PRINTING_ROWS_IN_SET_ORDER,
		printingRow,
		setLabel
	} from '#lib/collection/printing-search.js';
	import { test } from '#lib/filters/predicate.js';
	import { parseQuery } from '#lib/query/index.js';
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import QueryEditor from '#lib/components/filters/QueryEditor.svelte';

	let { data, form } = $props();

	let renaming = $state(false);
	let copied = $state(false);

	/** The Collection is read only to annotate; see the component comment. */
	$effect(() => void collection.load());

	const ownedOf = (printingId: string) => collection.quantityOf(printingId);

	const rows = $derived(
		data.entries.map((entry) => ({ entry, row: printingRow(entry.printingId) }))
	);

	const copies = $derived(data.entries.reduce((sum, entry) => sum + entry.quantity, 0));
	/** Already on the list, so the search panel can offer "+1" rather than a duplicate. */
	const wantedIds = $derived(new Set(data.entries.map((entry) => entry.printingId)));

	// ---------------------------------------------------------------------------------------------
	// Search panel — the same query language as `/cards` and the binder editor.

	const PAGE_SIZE = 96;

	let source = $state('');
	let inGoalOnly = $state(true);
	let limit = $state(PAGE_SIZE);

	const parsed = $derived(parseQuery(source, dataset));

	const matched = $derived(
		PRINTING_ROWS_IN_SET_ORDER.filter(
			(row) =>
				(!inGoalOnly || inGoal(row.printing, collection.goal)) &&
				test(parsed.predicate, dataset, row.card, row.printing, ownedOf)
		)
	);
	const results = $derived(matched.slice(0, limit));

	// Reads only what it resets on, so it can't depend on `limit` and re-trigger itself.
	$effect(() => {
		void source;
		void inGoalOnly;
		limit = PAGE_SIZE;
	});

	function onPanelScroll(event: UIEvent) {
		const panel = event.currentTarget as HTMLElement;
		const remaining = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
		if (remaining < 600 && limit < matched.length) limit += PAGE_SIZE;
	}

	const examples = ['owned:0', 'rarity>=epic', 'set:MS01-WNC', 'type:legend'];

	async function copyLink() {
		await navigator.clipboard.writeText(`${data.origin}/collection/wantlists/${data.wantlist.id}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<Meta
	title="{data.wantlist.name} — novastack"
	description="A wantlist of {data.entries.length} cards, kept by {data.wantlist.ownerName}."
	origin={data.origin}
	path="/collection/wantlists/{data.wantlist.id}"
/>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div class="min-w-0">
		<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Wantlist</p>
		{#if renaming}
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => {
					renaming = false;
					return async ({ update }) => update();
				}}
				class="mt-1 flex items-center gap-2"
			>
				<input
					name="name"
					value={data.wantlist.name}
					required
					maxlength="60"
					class="rounded-md border border-edge bg-surface px-3 py-1.5 text-2xl font-bold text-bright"
				/>
				<button type="submit" class="text-sm text-neon hover:text-bright">Save</button>
			</form>
		{:else}
			<h1 class="mt-1 truncate text-4xl font-bold tracking-tight text-bright">
				{data.wantlist.name}
			</h1>
		{/if}
		<p class="mt-2 text-sm text-muted tabular-nums">
			{data.entries.length}
			{data.entries.length === 1 ? 'card' : 'cards'} · {copies}
			{copies === 1 ? 'copy' : 'copies'}
			{#if !data.isOwner}· kept by {data.wantlist.ownerName}{/if}
		</p>
	</div>

	{#if data.isOwner}
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<a href="/collection/wantlists" class="px-2 py-2 text-muted hover:text-neon">All wantlists</a>

			{#if !renaming}
				<button
					type="button"
					onclick={() => (renaming = true)}
					class="px-2 py-2 text-muted hover:text-neon">Rename</button
				>
			{/if}

			<form method="POST" action="?/visibility" use:enhance>
				<input
					type="hidden"
					name="visibility"
					value={data.wantlist.visibility === 'shared' ? 'private' : 'shared'}
				/>
				<button
					type="submit"
					class="rounded-lg border border-edge px-3 py-2 text-body transition-colors
						hover:border-neon-dim hover:text-neon"
				>
					{data.wantlist.visibility === 'shared' ? 'Make private' : 'Share by link'}
				</button>
			</form>

			{#if data.wantlist.visibility === 'shared'}
				<button
					type="button"
					onclick={copyLink}
					class="rounded-lg border border-neon bg-neon/10 px-3 py-2 text-neon"
					>{copied ? 'Copied' : 'Copy link'}</button
				>
			{/if}
		</div>
	{/if}
</div>

{#if form?.message}
	<p class="mb-4 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body">
		{form.message}
	</p>
{/if}

<div class="flex flex-col gap-8 lg:flex-row">
	<div class="min-w-0 flex-1">
		{#if rows.length === 0}
			<p class="rounded-xl border border-dashed border-edge px-4 py-12 text-center text-muted">
				Nothing on this list yet.{#if data.isOwner}
					Search on the right and add what you're after.{/if}
			</p>
		{:else}
			<ul class="divide-y divide-edge/70 overflow-hidden rounded-xl border border-edge bg-shell">
				{#each rows as { entry, row } (entry.printingId)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
						{#if row}
							{@const owned = ownedOf(entry.printingId)}
							<div class="w-12 shrink-0">
								<!-- Veiled when you own none of it, exactly as everywhere else — though here it
								     is the expected state rather than the notable one. -->
								<div class="rounded" class:card-veil={owned === 0}>
									<CardImage
										printingId={row.printing.id}
										thumbhash={row.printing.thumbhash}
										color={row.card.color}
										alt=""
										sizes="48px"
										class="rounded"
									/>
								</div>
							</div>

							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-bright">{row.card.name}</p>
								<p class="font-mono text-[0.7rem] text-muted">
									{setLabel(row.printing.setId)} · {row.printing.collectorNumber}{row.printing
										.locale !== DEFAULT_LOCALE
										? ` · ${row.printing.locale.toUpperCase()}`
										: ''}
									{#if owned > 0}
										<span class="text-neon-dim">· you own {owned}</span>
									{/if}
								</p>
								{#if entry.note}
									<p class="mt-0.5 truncate text-xs text-muted/80">{entry.note}</p>
								{/if}
							</div>

							{#if data.isOwner}
								<!-- Absolute quantities: each button submits the number to end up at, so a
								     double click can't compound and zero is simply "Remove". -->
								<div class="flex shrink-0 items-center gap-1">
									{#each [entry.quantity - 1, entry.quantity + 1] as next, index (index)}
										<form method="POST" action="?/want" use:enhance class="contents">
											<input type="hidden" name="printingId" value={entry.printingId} />
											<input type="hidden" name="quantity" value={next} />
											<button
												type="submit"
												disabled={next > 999}
												aria-label={index === 0
													? `Want one fewer ${row.card.name}`
													: `Want one more ${row.card.name}`}
												class="grid size-7 place-items-center rounded border border-edge text-sm
													text-muted transition-colors hover:border-neon-dim hover:text-neon
													disabled:opacity-30">{index === 0 ? '−' : '+'}</button
											>
											{#if index === 0}
												<span class="w-8 text-center font-mono text-sm text-bright tabular-nums"
													>{entry.quantity}</span
												>
											{/if}
										</form>
									{/each}
								</div>

								<form method="POST" action="?/want" use:enhance class="shrink-0">
									<input type="hidden" name="printingId" value={entry.printingId} />
									<input type="hidden" name="quantity" value="0" />
									<button type="submit" class="text-xs text-muted hover:text-card-red"
										>Remove</button
									>
								</form>
							{:else}
								<span class="shrink-0 font-mono text-sm text-bright tabular-nums"
									>×{entry.quantity}</span
								>
							{/if}
						{:else}
							<!-- A Printing that has left the dataset. Shown rather than hidden: it is still on
							     the list, and silently dropping a row would look like data loss. -->
							<p class="flex-1 font-mono text-xs text-muted">
								Unknown printing {entry.printingId}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if data.isOwner}
		<!-- Side by side from `lg`, same reasoning as the binder editor: stacked, every addition
		     becomes a scroll. -->
		<aside
			onscroll={onPanelScroll}
			class="w-full shrink-0 self-start rounded-xl border border-edge bg-shell lg:sticky
				lg:top-[calc(var(--spacing-nav)+1rem)] lg:max-h-[calc(100vh-var(--spacing-nav)-2rem)]
				lg:w-80 lg:overflow-y-auto xl:w-96"
		>
			<div class="sticky top-0 z-10 space-y-3 border-b border-edge bg-shell p-4">
				<div class="flex items-baseline justify-between gap-2">
					<p class="text-xs font-medium tracking-widest text-muted uppercase">Add cards</p>
					<span class="font-mono text-[0.65rem] text-muted/70 tabular-nums">
						{#if matched.length > results.length}
							{results.length} of {matched.length}
						{:else}
							{matched.length} printings
						{/if}
					</span>
				</div>

				<QueryEditor
					id="wantlist-query"
					value={source}
					placeholder="Query — try owned:0 rarity>=epic"
					warnings={parsed.warnings}
					onSource={(next) => (source = next)}
				/>

				<div class="flex flex-wrap items-center gap-1.5">
					<button
						type="button"
						onclick={() => (inGoalOnly = !inGoalOnly)}
						aria-pressed={!inGoalOnly}
						title={inGoalOnly
							? 'Also show printings outside your collecting goal'
							: 'Only show printings in your collecting goal'}
						class="rounded-full border px-2 py-0.5 text-[0.65rem] transition-colors {inGoalOnly
							? 'border-edge text-muted hover:border-neon-dim hover:text-neon'
							: 'border-neon bg-neon/10 text-neon'}"
						>{inGoalOnly ? 'In goal' : 'All printings'}</button
					>

					{#if source.trim() === ''}
						{#each examples as example (example)}
							<button
								type="button"
								onclick={() => (source = example)}
								class="rounded-full border border-edge px-2 py-0.5 font-mono text-[0.65rem] text-muted
									transition-colors hover:border-neon-dim hover:text-neon">{example}</button
							>
						{/each}
					{/if}
				</div>
			</div>

			{#if results.length === 0}
				<p class="p-4 text-sm text-muted">Nothing matches that query.</p>
			{:else}
				<ul class="grid grid-cols-3 gap-2 p-4">
					{#each results as row (row.printing.id)}
						{@const owned = ownedOf(row.printing.id)}
						{@const already = wantedIds.has(row.printing.id)}
						<li>
							<!-- One click adds one copy. Absolute, like every other quantity here: the form
							     sends what it should become, which for a card already on the list is one more. -->
							<form method="POST" action="?/want" use:enhance>
								<input type="hidden" name="printingId" value={row.printing.id} />
								<input
									type="hidden"
									name="quantity"
									value={(data.entries.find((entry) => entry.printingId === row.printing.id)
										?.quantity ?? 0) + 1}
								/>
								<button
									type="submit"
									title="{row.card.name} · {setLabel(row.printing.setId)} {row.printing
										.collectorNumber} — add one"
									class="relative block w-full rounded-lg transition-transform
										hover:-translate-y-0.5 {owned === 0 ? 'card-veil' : ''} {already ? 'ring-2 ring-neon' : ''}"
								>
									<CardImage
										printingId={row.printing.id}
										thumbhash={row.printing.thumbhash}
										color={row.card.color}
										alt={row.card.name}
										sizes="110px"
										class="rounded-lg"
									/>
									<span
										class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1
											rounded-b-lg bg-void/85 px-1 py-0.5 font-mono text-[0.55rem] text-muted
											tabular-nums"
									>
										<span class="truncate">{row.printing.collectorNumber}</span>
										{#if already}<span class="ml-auto text-neon">wanted</span>{/if}
									</span>
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	{/if}
</div>
