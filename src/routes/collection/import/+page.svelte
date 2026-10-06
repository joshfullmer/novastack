<script lang="ts">
	/**
	 * `/collection/import` — the other half of Export CSV.
	 *
	 * Everything up to the button is client-side and writes nothing: parse, resolve against the
	 * dataset, diff against the Collection already loaded. The commit is one `setMany`, which is the
	 * existing atomic `POST /api/collection` — optimistic, rolled back whole on failure, so there is
	 * no half-imported state to describe. A page rather than a modal because the preview is a table
	 * of up to 720 rows. See `#lib/collection/import.js` for what an import does and doesn't do.
	 */
	import Meta from '#lib/components/Meta.svelte';
	import { collection } from '#lib/collection/state.svelte.js';
	import { planImport, parseTable, resolveRows, type ChangeKind } from '#lib/collection/import.js';
	import {
		PRINTING_ROWS,
		setLabel,
		type PrintingRow as Row
	} from '#lib/collection/printing-search.js';
	import { printTreatment } from '#lib/cards/derive.js';
	import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';

	let { data } = $props();

	/** A spreadsheet export of a whole Collection is ~100 KB; this is generous, not a target. */
	const MAX_FILE_BYTES = 2 * 1024 * 1024;

	const PLACEHOLDER =
		'quantity,set_identifier,collector_number,printing_id\n2,MS01 - WNC [A],042,…';

	const rowById = new Map<string, Row>(PRINTING_ROWS.map((row) => [row.printing.id, row]));

	let raw = $state('');
	let fileName = $state<string | null>(null);
	let fileError = $state<string | null>(null);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	/** How many rows the last commit wrote; `null` until one has. */
	let written = $state<number | null>(null);

	const parsed = $derived(raw.trim() === '' ? null : parseTable(raw));
	const resolution = $derived(parsed?.ok ? resolveRows(parsed.table) : null);
	const problem = $derived(
		parsed && !parsed.ok
			? parsed.error
			: resolution && 'error' in resolution
				? resolution.error
				: null
	);
	const resolved = $derived(resolution && !('error' in resolution) ? resolution : null);

	/**
	 * Against what the Collection holds **now**, so it re-plans by itself once a commit lands — the
	 * rows all read "unchanged", which is the honest picture of an import that is idempotent. Held
	 * until the Collection has loaded: against an empty one, every row would read as new.
	 */
	const plan = $derived(
		resolved && collection.editable ? planImport(resolved.entries, collection.all) : null
	);

	const decreasing = $derived(plan?.counts.decrease ?? 0);

	const KIND: Record<ChangeKind, { label: string; tone: string }> = {
		new: { label: 'New', tone: 'text-card-green' },
		increase: { label: 'More', tone: 'text-card-green' },
		decrease: { label: 'Fewer', tone: 'text-card-red' },
		unchanged: { label: 'Same', tone: 'text-muted' }
	};

	async function onFile(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		// Cleared so choosing the same file again (after fixing it) still fires `change`.
		event.currentTarget.value = '';
		if (!file) return;

		fileError = null;
		if (file.size > MAX_FILE_BYTES) {
			fileError = `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — a Collection export is a fraction of that. Is it the right file?`;
			return;
		}
		raw = await file.text();
		fileName = file.name;
		written = null;
		failure = null;
	}

	function onInput() {
		// Typing over a loaded file makes it no longer "the file".
		fileName = null;
		written = null;
		failure = null;
	}

	function reset() {
		raw = '';
		fileName = null;
		fileError = null;
		written = null;
		failure = null;
	}

	async function commit() {
		if (!plan || plan.changes.length === 0 || saving || !collection.editable) return;

		saving = true;
		failure = null;
		const count = plan.changes.length;
		await collection.setMany(new Map(plan.changes.map((row) => [row.printingId, row.quantity])));
		saving = false;

		// `setMany` rolls back and reports through `collection.error` rather than throwing.
		if (collection.error) failure = collection.error;
		else written = count;
	}

	const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);
</script>

<Meta
	title="Import — novastack"
	description="Bring a spreadsheet or an export back into your collection."
	origin={data.origin}
	path="/collection/import"
/>

<div class="mb-6">
	<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Bulk entry</p>
	<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">Import</h1>
	<p class="mt-2 max-w-xl text-sm text-muted">
		Each row <span class="text-body">sets</span> how many of a printing you own. Printings the file doesn't
		mention are left alone, and importing the same file twice changes nothing. You'll see every change
		before it's made.
	</p>
</div>

<div class="max-w-5xl">
	<div class="flex flex-wrap items-center gap-3">
		<label
			class="cursor-pointer rounded-lg border border-edge bg-surface px-4 py-2 text-sm text-body
				transition-colors focus-within:border-neon hover:border-neon hover:text-neon"
		>
			Choose a file…
			<input
				type="file"
				accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
				onchange={onFile}
				class="sr-only"
			/>
		</label>
		<span class="min-w-0 truncate text-sm text-muted">
			{fileName ?? 'or paste below — a CSV, or cells copied from a spreadsheet'}
		</span>
		{#if raw !== ''}
			<button type="button" onclick={reset} class="ml-auto text-sm text-muted hover:text-neon"
				>Start over</button
			>
		{/if}
	</div>

	{#if fileError}
		<p
			role="alert"
			class="mt-3 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body"
		>
			{fileError}
		</p>
	{/if}

	<label class="mt-3 block">
		<span class="sr-only">Paste CSV or tab-separated rows</span>
		<textarea
			bind:value={raw}
			oninput={onInput}
			rows="6"
			spellcheck="false"
			placeholder={PLACEHOLDER}
			class="w-full resize-y rounded-xl border-2 border-edge bg-surface px-4 py-3 font-mono text-xs
				text-bright placeholder:text-muted/50 focus:border-neon focus:outline-none"></textarea>
	</label>
	<p class="mt-1.5 text-xs text-muted/70">
		Needs a <span class="font-mono text-muted">quantity</span> column and either
		<span class="font-mono text-muted">printing_id</span>
		(what Export CSV writes) or both
		<span class="font-mono text-muted">set_identifier</span>
		and <span class="font-mono text-muted">collector_number</span>, with an optional
		<span class="font-mono text-muted">locale</span>.
	</p>

	{#if problem}
		<p
			role="alert"
			class="mt-4 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body"
		>
			{problem}
		</p>
	{:else if resolved && !plan}
		<p class="mt-4 text-sm text-muted">Loading your collection…</p>
	{/if}

	{#if written !== null}
		<p
			role="status"
			class="mt-4 rounded-lg border border-neon/40 bg-neon/10 px-4 py-3 text-sm text-body"
		>
			Imported {written}
			{plural(written, 'change')}.
			<a href="/collection" class="ml-1 text-neon hover:underline">Back to your collection →</a>
		</p>
	{/if}

	{#if failure}
		<p
			role="alert"
			class="mt-4 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body"
		>
			Nothing was imported — {failure}. Your collection is unchanged.
		</p>
	{/if}

	{#if plan && resolved}
		<section class="mt-8" aria-label="Preview">
			<div class="flex flex-wrap items-baseline gap-x-6 gap-y-2">
				<h2 class="text-lg font-semibold text-bright">Preview</h2>
				<dl class="flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm tabular-nums">
					<div class="flex gap-1.5">
						<dt class="text-muted">new</dt>
						<dd class="text-card-green">{plan.counts.new}</dd>
					</div>
					<div class="flex gap-1.5">
						<dt class="text-muted">more</dt>
						<dd class="text-card-green">{plan.counts.increase}</dd>
					</div>
					<div class="flex gap-1.5">
						<dt class="text-muted">fewer</dt>
						<dd class={plan.counts.decrease > 0 ? 'text-card-red' : 'text-muted'}>
							{plan.counts.decrease}
						</dd>
					</div>
					<div class="flex gap-1.5">
						<dt class="text-muted">unchanged</dt>
						<dd class="text-muted">{plan.counts.unchanged}</dd>
					</div>
					<div class="flex gap-1.5">
						<dt class="text-muted">unresolved</dt>
						<dd class={resolved.unresolved.length > 0 ? 'text-card-red' : 'text-muted'}>
							{resolved.unresolved.length}
						</dd>
					</div>
				</dl>
			</div>

			{#if decreasing > 0}
				<p
					class="mt-3 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body"
				>
					<span class="font-medium text-card-red">{decreasing}</span>
					{plural(decreasing, 'printing')} would end up with <em>fewer</em> copies than you have now —
					marked below. Nothing is ever removed unless the file says so.
				</p>
			{/if}

			{#if resolved.warnings.length > 0}
				<ul class="mt-3 space-y-1 text-sm text-muted">
					{#each resolved.warnings as warning (warning)}
						<li>{warning}</li>
					{/each}
				</ul>
			{/if}

			<div class="mt-4 flex items-center gap-4">
				<button
					type="button"
					onclick={commit}
					disabled={plan.changes.length === 0 || saving || !collection.editable}
					class="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-void transition-opacity
						hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{saving
						? 'Importing…'
						: `Import ${plan.changes.length} ${plural(plan.changes.length, 'change')}`}
				</button>
				{#if plan.changes.length === 0}
					<span class="text-sm text-muted"
						>{plan.rows.length === 0
							? 'No rows could be read.'
							: 'Your collection already matches this file.'}</span
					>
				{/if}
			</div>

			{#if plan.changes.length > 0}
				<ul class="mt-4 overflow-hidden rounded-xl border border-edge bg-shell">
					{#each plan.changes as row (row.printingId)}
						{@const info = rowById.get(row.printingId)}
						<li
							class="flex items-center gap-4 border-b border-edge/50 px-4 py-2.5 last:border-b-0
								{row.kind === 'decrease' ? 'bg-card-red/10' : ''}"
						>
							<span class="w-10 shrink-0 text-right font-mono text-xs text-muted/70 tabular-nums"
								>{row.line}</span
							>
							<span class="w-12 shrink-0 text-xs font-medium {KIND[row.kind].tone}"
								>{KIND[row.kind].label}</span
							>
							<span class="min-w-0 flex-1 truncate text-sm text-body">{info?.card.name}</span>
							<span class="hidden shrink-0 font-mono text-xs text-muted sm:inline">
								{info ? setLabel(info.printing.setId) : ''} · {info?.printing.collectorNumber}
								{#if info && info.printing.locale !== DEFAULT_LOCALE}
									· {info.printing.locale.toUpperCase()}
								{/if}
								{#if info && printTreatment(info.printing) === 'beta'}
									· β
								{/if}
							</span>
							<span
								class="w-24 shrink-0 text-right font-mono text-sm tabular-nums {KIND[row.kind]
									.tone}"
							>
								{row.from} → {row.quantity}
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if resolved.unresolved.length > 0}
				<div class="mt-8">
					<h2 class="text-lg font-semibold text-bright">
						Couldn't read
						<span class="ml-1 font-mono text-sm text-muted tabular-nums"
							>{resolved.unresolved.length}
							{plural(resolved.unresolved.length, 'row')}</span
						>
					</h2>
					<p class="mt-1 text-sm text-muted">
						These are skipped; the rest still import. Fix them in the file and import again — rows
						already applied will read as unchanged.
					</p>
					<ul class="mt-3 overflow-hidden rounded-xl border border-edge bg-shell">
						{#each resolved.unresolved as row (row.line)}
							<li
								class="flex items-baseline gap-4 border-b border-edge/50 px-4 py-2.5 last:border-b-0"
							>
								<span class="w-10 shrink-0 text-right font-mono text-xs text-muted/70 tabular-nums"
									>{row.line}</span
								>
								<span class="w-2/5 min-w-0 truncate font-mono text-xs text-muted" title={row.raw}
									>{row.raw}</span
								>
								<span class="min-w-0 flex-1 text-sm text-card-red">{row.reason}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}
</div>
