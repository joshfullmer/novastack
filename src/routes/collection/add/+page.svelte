<script lang="ts">
	/**
	 * `/collection/add` — rapid entry.
	 *
	 * The prototype's Variant D, which was the only variant that treated **data entry** as the
	 * primary job rather than a secondary affordance on a grid. Borrowed from the MTG scanner apps
	 * (ManaBox, Delver Lens, Dragon Shield companion): one focused field, a running session log,
	 * and per-entry undo. Built for entering a box in one sitting, not for browsing.
	 *
	 * **Collector number first.** That is what is printed on the card in your hand, so it is what
	 * you should be able to type. Name matching is the fallback, not the lead.
	 *
	 * The session log earns its place because a mistyped number is the common error, and undoing
	 * the wrong row is worse than not undoing at all — so undo is per entry rather than a single
	 * "undo last".
	 */
	import CardImage from '#lib/components/CardImage.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import { printTreatment } from '#lib/cards/derive.js';
	import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import { inGoal } from '#lib/collection/goal.js';
	import {
		searchPrintings,
		setLabel,
		type PrintingRow as Row
	} from '#lib/collection/printing-search.js';

	let { data } = $props();

	let raw = $state('');
	let field = $state<HTMLInputElement>();
	let highlight = $state(0);
	let log = $state<{ id: string; row: Row; quantity: number }[]>([]);

	/** `042`, `β042 x3`, `3x adam smasher` — quantity on either end, term in the middle. */
	function parse(input: string): { quantity: number; term: string } {
		const trimmed = input.trim();
		const trailing = /^(.*?)\s*[x×*]\s*(\d+)$/i.exec(trimmed);
		if (trailing) return { quantity: Number(trailing[2]), term: trailing[1].trim() };
		const leading = /^(\d+)\s*[x×*]\s*(.*)$/i.exec(trimmed);
		if (leading) return { quantity: Number(leading[1]), term: leading[2].trim() };
		return { quantity: 1, term: trimmed };
	}

	const parsed = $derived(parse(raw));

	/** Tiering, ordering and the result cap all live in `#lib/collection/printing-search.js`,
	 * shared with the Binder editor. */
	const matches = $derived(searchPrintings(parsed.term));

	function commit(row: Row | undefined = matches[highlight]) {
		if (!row || !collection.editable) return;

		collection.adjust(row.printing.id, parsed.quantity);
		log.unshift({ id: crypto.randomUUID(), row, quantity: parsed.quantity });
		raw = '';
		highlight = 0;
		field?.focus();
	}

	function undo(entry: { id: string; row: Row; quantity: number }) {
		collection.adjust(entry.row.printing.id, -entry.quantity);
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

	/**
	 * Focus once the field is actually usable.
	 *
	 * `autofocus` is no good here: the input is disabled until the Collection loads, so the
	 * attribute fires against a disabled element and is simply dropped — leaving the page claiming
	 * "the field above is already focused" while it isn't. The guard is a plain boolean rather than
	 * `$state`, so this can't re-focus and fight the user after they click elsewhere.
	 */
	let hasFocused = false;

	$effect(() => {
		if (!collection.editable || !field || hasFocused) return;
		hasFocused = true;
		field.focus();
	});

	/**
	 * The art of whichever row is highlighted — by hover, by arrow key, or by Tab.
	 *
	 * This is the point of the whole list: three printings share collector number `001`, and their
	 * set codes and rarities are a poor way to tell them apart compared with just looking. Deliberately
	 * **not** `CardHoverPreview`, which shows a Card's Default Printing — here the specific printing
	 * is the entire question.
	 *
	 * A panel beside the list rather than a cursor-following popup: it holds still while you arrow
	 * through, and a popup would cover the very rows you are comparing.
	 */
	const preview = $derived(matches[highlight] ?? null);

	const sessionCopies = $derived(log.reduce((sum, entry) => sum + entry.quantity, 0));
</script>

<Meta
	title="Add cards — novastack"
	description="Type a collector number and press Enter."
	origin={data.origin}
	path="/collection/add"
/>

<div class="mb-6">
	<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Rapid entry</p>
	<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">Add cards</h1>
	<p class="mt-2 max-w-xl text-sm text-muted">
		Type the collector number printed on the card and press Enter. <span class="text-body">042</span
		>, <span class="text-body">β042 ×3</span>, <span class="text-body">3x adam smasher</span>.
	</p>
</div>

<!-- Wider than a reading column, because the preview sits beside the match list rather than
     over it. `max-w-3xl` left no room and the preview simply never appeared. -->
<div class="max-w-5xl">
	<div class="relative">
		<input
			bind:this={field}
			bind:value={raw}
			onkeydown={onKeydown}
			disabled={!collection.editable}
			autocomplete="off"
			spellcheck="false"
			placeholder="Collector number, or a name…"
			class="w-full rounded-xl border-2 border-edge bg-surface px-5 py-5 font-mono text-2xl
				text-bright placeholder:text-muted/50 focus:border-neon focus:outline-none
				disabled:opacity-50"
		/>
		{#if parsed.quantity > 1}
			<span
				class="absolute top-1/2 right-5 -translate-y-1/2 rounded-md bg-neon/15 px-3 py-1.5
					font-mono text-sm text-neon">×{parsed.quantity}</span
			>
		{/if}
	</div>

	<div class="mt-2 flex items-start gap-4">
		{#if matches.length > 0}
			<ul class="min-w-0 flex-1 overflow-hidden rounded-xl border border-edge bg-shell">
				{#each matches as row, index (row.printing.id)}
					{@const owned = collection.quantityOf(row.printing.id)}
					<li>
						<button
							type="button"
							onclick={() => commit(row)}
							onmouseenter={() => (highlight = index)}
							onfocus={() => (highlight = index)}
							class="flex w-full items-center gap-4 px-4 py-3 text-left {index === highlight
								? 'bg-raised'
								: 'hover:bg-surface'}"
						>
							<span class="w-16 shrink-0 font-mono text-sm text-neon tabular-nums"
								>{row.printing.collectorNumber}</span
							>
							<span class="min-w-0 flex-1 truncate text-body">{row.card.name}</span>
							<span class="hidden shrink-0 font-mono text-xs text-muted sm:inline"
								>{setLabel(row.printing.setId)}</span
							>
							{#if printTreatment(row.printing) === 'beta' || row.printing.locale !== DEFAULT_LOCALE}
								<span class="shrink-0 font-mono text-[0.65rem] text-muted/70">
									{printTreatment(row.printing) === 'beta' ? 'β' : ''}{row.printing.locale !==
									DEFAULT_LOCALE
										? row.printing.locale.toUpperCase()
										: ''}
								</span>
							{/if}
							<span class="w-20 shrink-0 text-right text-xs text-muted">{row.printing.rarity}</span>
							<span class="w-12 shrink-0 text-right font-mono text-sm text-bright tabular-nums"
								>{owned > 0 ? `×${owned}` : '—'}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		{:else if raw.trim().length > 0}
			<p class="flex-1 px-1 pt-1 text-sm text-muted">No printing matches “{parsed.term}”.</p>
		{/if}

		{#if preview}
			<!-- A `div`, not an `aside`: the rail is already this page's complementary region, and two
			     would just make the landmark list ambiguous. -->
			<!-- From `md` up: at that width the rail is already hidden, so there is room. Gating it at
			     `xl` meant most windows never saw the one thing that tells three printings apart. -->
			<div class="sticky top-nav hidden w-44 shrink-0 md:block">
				<CardImage
					printingId={preview.printing.id}
					thumbhash={preview.printing.thumbhash}
					color={preview.card.color}
					alt={preview.card.name}
					sizes="176px"
					class="rounded-lg shadow-2xl shadow-void"
				/>
				<p class="mt-2 truncate text-xs text-body">{preview.card.name}</p>
				<p class="font-mono text-[0.65rem] text-muted">
					{setLabel(preview.printing.setId)} · {preview.printing.collectorNumber}
				</p>
				<p class="text-[0.65rem] text-muted/70">
					{preview.printing.rarity} · {preview.printing.artist}
				</p>
				{#if !inGoal(preview.printing, collection.goal)}
					<p class="mt-1 font-mono text-[0.6rem] tracking-wide text-muted/60 uppercase">off goal</p>
				{/if}
			</div>
		{/if}
	</div>

	{#if collection.error}
		<p
			class="mt-3 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body"
		>
			{collection.error}
		</p>
	{/if}

	<div class="mt-10">
		<div class="mb-3 flex items-baseline gap-3">
			<h2 class="text-lg font-semibold text-bright">This session</h2>
			<span class="font-mono text-sm text-muted tabular-nums"
				>{log.length}
				{log.length === 1 ? 'entry' : 'entries'} · {sessionCopies}
				{sessionCopies === 1 ? 'copy' : 'copies'}</span
			>
			{#if log.length > 0}
				<button
					type="button"
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
					<li class="flex items-center gap-4 rounded-lg border border-edge/50 bg-shell px-4 py-2.5">
						<span class="w-14 shrink-0 font-mono text-sm text-neon tabular-nums"
							>+{entry.quantity}</span
						>
						<span class="min-w-0 flex-1 truncate text-sm text-body">{entry.row.card.name}</span>
						<span class="shrink-0 font-mono text-xs text-muted"
							>{setLabel(entry.row.printing.setId)} · {entry.row.printing.collectorNumber}</span
						>
						<button
							type="button"
							onclick={() => undo(entry)}
							class="shrink-0 text-xs text-muted hover:text-neon">undo</button
						>
					</li>
				{/each}
			</ul>

			<div class="mt-8">
				<p class="mb-3 text-xs font-medium tracking-widest text-muted uppercase">Recently added</p>
				<div class="flex gap-2 overflow-x-auto pb-2">
					{#each log.slice(0, 14) as entry (entry.id)}
						<div class="w-20 shrink-0">
							<CardImage
								printingId={entry.row.printing.id}
								thumbhash={entry.row.printing.thumbhash}
								color={entry.row.card.color}
								alt={entry.row.card.name}
								sizes="80px"
								class="rounded"
							/>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
