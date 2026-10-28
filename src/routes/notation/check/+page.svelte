<script lang="ts">
	/**
	 * The Check page: paste a Transcript, get every illegal move by turn, the final board and the
	 * computed winner. The validator is the *last* page of the Notation section, not its front door —
	 * it is for people who already write the notation, so its chrome stays modest and the lesson
	 * lives at `/notation`.
	 *
	 * **Sharing is the game in the URL hash** (`#g=…`, `#lib/notation/share.js`): no backend, the
	 * route stays prerendered, and the hash never reaches the server. The hash is read once on mount
	 * and rewritten, debounced, as the box is edited — so the address bar is always the share link
	 * and the Share button's only job is to put it on the clipboard.
	 *
	 * **Input has no hover; output does.** A `<textarea>` cannot carry per-token tooltips, so the
	 * result column re-renders every turn through `NotationLine`, where each move explains itself —
	 * or says why it is illegal.
	 */
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Board from '#lib/components/notation/Board.svelte';
	import NotationLine from '#lib/components/notation/NotationLine.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import PageHeader from '#lib/components/notation/PageHeader.svelte';
	import { INVALID_GAME, VALID_GAME } from '#lib/notation/examples.js';
	import { analyzeDocument, PLAYER_LABEL } from '#lib/notation/index.js';
	import type { Outcome, Owner } from '#lib/notation/index.js';
	import { NOTATION_LAUNCHED } from '#lib/notation/launch.js';
	import { fromHash, toHash } from '#lib/notation/share.js';

	let { data } = $props();

	const PRESETS = [
		{ id: 'opening', label: 'Opening', text: "A3\nA'2\nB5\nB'4\nC6\nC'3" },
		{
			id: 'skirmish',
			label: 'Skirmish',
			text: "1| A3\n2| A'4\n3| B2\n4| B'5\n5| C4 +B4 xA'\n6| C'6 xC\n7| D7 xB'\n8| D'6"
		},
		{ id: 'match', label: 'Full game', text: VALID_GAME },
		{ id: 'invalid', label: 'Eight errors', text: INVALID_GAME }
	];

	/** How long the box must sit still before the address bar follows it. */
	const HASH_DEBOUNCE_MS = 300;
	/** How long "Link copied" stays up. */
	const COPIED_MS = 2000;

	const PLACEHOLDER = [
		'; one turn per line; odd turns belong to the first player',
		'; first: WE   (optional header)',
		'',
		'1| A4 -A1',
		"2| A'4",
		'3| B4 (-B2)'
	].join('\n');

	let text = $state('');
	/** The hash is only written once the incoming one has been read, or an empty box would erase it. */
	let ready = $state(false);
	let copied = $state<'idle' | 'copied' | 'failed'>('idle');

	const report = $derived(analyzeDocument(text));
	const empty = $derived(!text.trim());
	const valid = $derived(report.errors.length === 0);

	/** Turns that carry an error, so a row can say so without re-deriving it. */
	const failing = $derived(new Set(report.errors.map((e) => e.turn)));

	onMount(() => {
		const shared = fromHash(location.hash);
		if (shared !== null) text = shared;
		ready = true;
	});

	$effect(() => {
		if (!ready) return;
		const hash = toHash(text);
		const timer = setTimeout(() => {
			if (location.hash === hash) return;
			// Same page, only the hash changes; the path is the current one and already resolved.
			replaceState(`${location.pathname}${location.search}${hash}`, {});
		}, HASH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	/** Back to an empty box: the address bar's hash follows it down to nothing. */
	function reset() {
		text = '';
		copied = 'idle';
	}

	async function share() {
		const link = `${location.origin}${location.pathname}${toHash(text)}`;
		try {
			await navigator.clipboard.writeText(link);
			copied = 'copied';
		} catch {
			// No clipboard permission — the address bar already holds the same link.
			copied = 'failed';
		}
		setTimeout(() => (copied = 'idle'), COPIED_MS);
	}

	function describeOutcome(outcome: Outcome): string {
		if (outcome.kind === 'undecided') return 'No winner yet';
		const how =
			outcome.how === 'start'
				? 'at the start of turn'
				: outcome.how === 'overtime'
					? 'by overtime steal, turn'
					: 'as overtime begins, after turn';
		return `${PLAYER_LABEL[outcome.player]} wins ${how} ${outcome.turn}`;
	}

	const actorText: Record<Owner, string> = { w: 'text-neon', t: 'text-card-red' };
</script>

<Meta
	title="Check a game — Nova Notation — novastack"
	description="Paste a Cyberpunk TCG game written in Nova Notation and see every illegal move by turn, the final board and the winner."
	origin={data.origin}
	path="/notation/check"
	noindex={!NOTATION_LAUNCHED}
/>

<PageHeader title="Check a game">Paste a Cyberpunk TCG game written in Nova Notation.</PageHeader>

<div class="space-y-5">
	<div class="flex flex-wrap items-center gap-2">
		<span class="font-mono text-xs tracking-widest text-muted">EXAMPLES</span>
		{#each PRESETS as preset (preset.id)}
			<button
				type="button"
				class="rounded border border-edge px-2.5 py-1 font-mono text-xs text-body transition-colors hover:border-neon hover:text-neon"
				onclick={() => (text = preset.text)}>{preset.label}</button
			>
		{/each}
	</div>

	<div class="grid items-start gap-4 md:grid-cols-2">
		<section class="rounded-lg border border-edge bg-surface">
			<div class="flex items-center justify-between border-b border-edge px-3 py-2">
				<label for="transcript" class="font-mono text-xs tracking-widest text-muted"
					>TRANSCRIPT</label
				>
				<span class="flex items-center gap-3">
					<span class="min-w-[8ch] text-right font-mono text-xs text-muted"
						>{report.turns.length} turn{report.turns.length === 1 ? '' : 's'}</span
					>
					<button
						type="button"
						class="rounded border border-edge px-2.5 py-1 font-mono text-xs text-body transition-colors hover:border-card-red hover:text-card-red disabled:pointer-events-none disabled:opacity-40"
						disabled={empty}
						onclick={reset}>Reset</button
					>
					<button
						type="button"
						class="rounded border border-edge px-2.5 py-1 font-mono text-xs text-body transition-colors hover:border-neon hover:text-neon disabled:pointer-events-none disabled:opacity-40"
						disabled={empty}
						onclick={share}>Share</button
					>
				</span>
			</div>
			<textarea
				id="transcript"
				bind:value={text}
				spellcheck="false"
				autocomplete="off"
				placeholder={PLACEHOLDER}
				class="block min-h-80 w-full resize-y bg-transparent p-4 font-mono text-sm leading-7 text-bright outline-none placeholder:text-muted/60 md:min-h-[32rem]"
			></textarea>
			<p role="status" class="h-7 border-t border-edge px-3 py-1.5 font-mono text-xs text-neon">
				{#if copied === 'copied'}Link copied{:else if copied === 'failed'}<span class="text-muted"
						>Couldn’t copy — the link is in the address bar</span
					>{/if}
			</p>
		</section>

		<section class="space-y-3" aria-live="polite">
			{#if empty}
				<p class="rounded-lg border border-edge bg-surface px-4 py-6 font-mono text-sm text-muted">
					Awaiting a transcript. Pick an example, or type one move per turn.
				</p>
			{:else}
				<div
					class="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border px-4 py-3 {valid
						? 'border-neon/40 bg-neon/10'
						: 'border-card-red/40 bg-card-red/10'}"
				>
					<span class="text-xl font-semibold tracking-wide {valid ? 'text-neon' : 'text-card-red'}"
						>{valid ? 'VALID' : 'INVALID'}</span
					>
					<span class="ml-auto text-sm {valid ? 'text-neon/90' : 'text-card-red/90'}">
						{valid
							? describeOutcome(report.outcome)
							: `${report.errors.length} error${report.errors.length === 1 ? '' : 's'}`}
					</span>
				</div>

				{#each report.warnings as warning (warning)}
					<p class="rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-body">
						⚠ {warning}
					</p>
				{/each}

				{#if !valid}
					<ul class="space-y-1.5">
						{#each report.errors as error, i (`${error.turn}-${i}`)}
							<li class="flex gap-3 rounded border border-edge bg-surface px-3 py-2">
								<span class="font-mono text-sm text-card-red"
									>T{String(error.turn).padStart(2, '0')}</span
								>
								<span class="min-w-0">
									<span class="block font-mono text-sm break-words text-bright"
										>{error.raw || '(blank)'}</span
									>
									<span class="block text-xs text-muted">{error.reason}</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}

				{#if valid}
					<Board state={report.state} />
				{/if}

				<div class="rounded-lg border border-edge bg-surface">
					<div class="flex items-center justify-between border-b border-edge px-3 py-2">
						<span class="font-mono text-xs tracking-widest text-muted">TURN BY TURN</span>
						<span class="font-mono text-xs text-muted">first: {PLAYER_LABEL[report.first]}</span>
					</div>
					<p class="px-3 pt-2 text-xs text-muted">Hover, focus or tap a move to read it.</p>
					<ol class="py-1">
						{#each report.turns as turn (turn.number)}
							<li
								class="flex items-baseline gap-3 px-3 py-1.5 text-sm {failing.has(turn.number)
									? 'bg-card-red/5'
									: ''}"
							>
								<span class="w-6 shrink-0 text-right font-mono text-xs {actorText[turn.actor]}"
									>{turn.number}</span
								>
								<span class="w-10 shrink-0 font-mono text-[0.65rem] tracking-widest text-muted"
									>{PLAYER_LABEL[turn.actor]}</span
								>
								<NotationLine {turn} prefix />
							</li>
						{/each}
					</ol>
				</div>
			{/if}
		</section>
	</div>
</div>
