<script lang="ts">
	/**
	 * Export as text: one tab per format, a live preview of exactly what gets copied, and
	 * Copy / Download. The formats are `#lib/decks/export.ts`'s — `docs/spec/deckbuilder.md` §6.
	 */
	type FormatId = 'default' | 'melee' | 'json';

	let { deckName, textFor }: { deckName: string; textFor: (id: FormatId) => string } = $props();

	const FORMATS: {
		id: FormatId;
		label: string;
		description: string;
		mime: string;
		ext: string;
	}[] = [
		{
			id: 'default',
			label: 'Default',
			description:
				'The standard list — use it everywhere except Melee, including the official deckbuilder’s import.',
			mime: 'text/plain',
			ext: 'txt'
		},
		{
			id: 'melee',
			label: 'Melee',
			description: 'Paste into a Melee decklist submission.',
			mime: 'text/plain',
			ext: 'txt'
		},
		{
			id: 'json',
			label: 'JSON',
			description: 'Structured data for scripts and other tools.',
			mime: 'application/json',
			ext: 'json'
		}
	];
	const byId = (id: FormatId) => FORMATS.find((format) => format.id === id)!;

	let dialogEl = $state<HTMLDialogElement>();
	let active = $state<FormatId>('default');
	let status = $state<'idle' | 'copied' | 'copy-failed'>('idle');

	async function copy(id: FormatId) {
		try {
			await navigator.clipboard.writeText(textFor(id));
			status = 'copied';
		} catch {
			status = 'copy-failed';
		}
		setTimeout(() => (status = 'idle'), 1500);
	}

	function download(id: FormatId) {
		const { mime, ext } = byId(id);
		const url = URL.createObjectURL(new Blob([textFor(id)], { type: mime }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${deckName}.${ext}`;
		a.click();
		URL.revokeObjectURL(url);
	}

	const button =
		'rounded-md border border-edge px-3 py-1.5 text-sm text-body hover:border-neon hover:text-neon';
	const primary = 'rounded-md bg-neon px-3 py-1.5 text-sm font-medium text-void hover:bg-neon-dim';
</script>

<button type="button" onclick={() => dialogEl?.showModal()} class={button}>Export</button>
<dialog
	bind:this={dialogEl}
	aria-label="Export decklist"
	class="w-full max-w-2xl rounded-lg border border-edge bg-shell p-4"
>
	<div role="tablist" class="flex gap-1 border-b border-edge">
		{#each FORMATS as format (format.id)}
			<button
				type="button"
				role="tab"
				aria-selected={active === format.id}
				onclick={() => (active = format.id)}
				class="-mb-px border-b-2 px-3 py-1.5 text-sm {active === format.id
					? 'border-neon text-neon'
					: 'border-transparent text-body hover:text-neon'}">{format.label}</button
			>
		{/each}
	</div>
	<p class="mt-3 text-sm text-muted">{byId(active).description}</p>
	<textarea
		readonly
		rows="14"
		value={textFor(active)}
		class="mt-2 w-full rounded-md border border-edge bg-void p-2 font-mono text-xs text-body"
	></textarea>
	<div class="mt-4 flex justify-end gap-2">
		<button type="button" onclick={() => dialogEl?.close()} class={button}>Close</button>
		<button type="button" onclick={() => download(active)} class={button}>
			Download .{byId(active).ext}
		</button>
		<button type="button" onclick={() => copy(active)} class={primary}>
			{status === 'copied' ? 'Copied!' : status === 'copy-failed' ? 'Copy failed' : 'Copy'}
		</button>
	</div>
</dialog>
