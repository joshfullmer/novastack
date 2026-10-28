<script lang="ts">
	/**
	 * The Notation front door. **A game being read, not described.**
	 *
	 * A worked game on the left, written on the scoresheet it is meant for — the same column the
	 * printable sheet is made of (`SheetGame`) — and the board it produces on the right, stepped a
	 * turn at a time. The page's one job is the "I can read this" moment, so it shows `VALID_GAME`
	 * — the same game the reference page asserts — rather than explaining the grammar first. The
	 * checker is deliberately *not* here: it is one link away (`/notation/check`), because the
	 * people who need it already write notation.
	 *
	 * Every token in the list explains itself on hover, focus or tap (`NotationToken`), and the
	 * current turn is also narrated underneath in plain text, because a tooltip is the wrong thing
	 * to depend on for the one sentence the page exists to show.
	 *
	 * The stepper is the only client state; the rest prerenders.
	 */
	import Board from '#lib/components/notation/Board.svelte';
	import Cheatsheet from '#lib/components/notation/Cheatsheet.svelte';
	import PageHeader from '#lib/components/notation/PageHeader.svelte';
	import NotationLine from '#lib/components/notation/NotationLine.svelte';
	import SheetGame from '#lib/components/notation/SheetGame.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import {
		PLAYER_LABEL,
		analyzeDocument,
		describeMove,
		initialState,
		narrateTurn,
		splitTurn
	} from '#lib/notation/index.js';
	import { VALID_GAME } from '#lib/notation/examples.js';
	import { NOTATION_LAUNCHED } from '#lib/notation/launch.js';

	let { data } = $props();

	const report = analyzeDocument(VALID_GAME);
	const last = report.turns.length;

	/** 0 is the board before turn 1; `n` is the board after turn `n`. */
	let step = $state(0);

	const board = $derived(step === 0 ? initialState() : report.turns[step - 1].state);
	const before = $derived(step <= 1 ? initialState() : report.turns[step - 2].state);
	const current = $derived(step === 0 ? undefined : report.turns[step - 1]);

	const outcome = report.outcome;

	/**
	 * The turn the intro says twice. Turn 9 has a roll, a lowering and a steal of two dice — the
	 * three things nearly every turn is made of — and both cards are read off the real report, so
	 * the story cannot drift from what the validator would say. No Reaction here, on purpose: cards can
	 * be played in the React Step, but none in the current pool changes a die there, so the front door
	 * does not teach it.
	 */
	/**
	 * Where a reader goes once they can read a line. The section's tab row is at the top of the page and
	 * not sticky, so by the time the cheatsheet has been read it is a scroll away — and a bare row of
	 * links says nothing about what is behind them.
	 */
	const next = [
		{
			href: '/notation/scoresheet',
			title: 'Print the scoresheet',
			body: 'Four matches to a page. Write your next game on it, one turn to a row.'
		},
		{
			href: '/notation/check',
			title: 'Check a game',
			body: 'Paste a game you wrote and see every illegal move, turn by turn.'
		},
		{
			href: '/notation/reference',
			title: 'Read the reference',
			body: 'Every move and rule, with the section of the Comprehensive Rules behind it.'
		}
	];

	const sample = report.turns[8];
	const said = narrateTurn(sample);
	const written = splitTurn(sample.raw).body;
</script>

<Meta
	title="Nova Notation — novastack"
	description="A handwriting-first notation for recording a Cyberpunk TCG game's dice state: learn it in two minutes, print the scoresheet, check a game."
	origin={data.origin}
	path="/notation"
	noindex={!NOTATION_LAUNCHED}
/>

<PageHeader title="Write down a Cyberpunk TCG game in one line per turn.">
	A few characters per turn, by hand, at the table — enough for a judge to verify and for you to
	replay.
</PageHeader>

<div class="space-y-14">
	<section class="space-y-3" aria-label="One turn, said and written">
		<div class="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
			<div class="rounded-lg border border-edge bg-surface p-4">
				<p class="font-mono text-xs tracking-widest text-muted">WHAT HAPPENED</p>
				<p class="mt-2 leading-relaxed text-body">{said}</p>
			</div>
			<span
				class="self-center text-center font-mono text-xl text-neon max-md:rotate-90"
				aria-hidden="true">→</span
			>
			<div class="rounded-lg border border-neon/40 bg-neon/5 p-4">
				<p class="font-mono text-xs tracking-widest text-neon">WHAT YOU WRITE</p>
				<p class="mt-2 text-3xl leading-tight"><NotationLine turn={sample} /></p>
				<p class="mt-2 text-sm text-muted">
					{written.length} characters. Hover any piece to hear it.
				</p>
			</div>
		</div>
	</section>

	<div class="space-y-4">
		<h2 class="text-xl font-semibold text-bright">Example game</h2>

		<section class="grid items-start gap-6 md:grid-cols-2" aria-label="A worked game">
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<button
						type="button"
						class="rounded border border-edge px-3 py-1 font-mono text-xs text-body hover:border-neon hover:text-neon disabled:opacity-30"
						disabled={step === 0}
						onclick={() => step--}>← prev</button
					>
					<span class="font-mono text-xs text-muted">turn {step} / {last}</span>
					<button
						type="button"
						class="rounded border border-edge px-3 py-1 font-mono text-xs text-body hover:border-neon hover:text-neon disabled:opacity-30"
						disabled={step === last}
						onclick={() => step++}>next →</button
					>
				</div>
				<!-- The page's one piece of paper: the same column the printed scoresheet is made of, a
				     little larger, with the game written in. -->
				<div
					class="shadow-2xl shadow-black/60"
					style="--sheet-unit: 1.25mm; --row-min: calc(var(--sheet-unit) * 5.6); --paper-tilt: -1deg; rotate: var(--paper-tilt)"
				>
					<SheetGame
						game={1}
						turns={report.turns}
						{step}
						first={report.first}
						rows={last + 2}
						onselect={(turn) => (step = turn)}
					/>
				</div>
			</div>

			<div class="space-y-3 md:sticky md:top-[calc(var(--spacing-nav)+1rem)]">
				<Board state={board} prev={before} />
				<div
					class="min-h-16 rounded-lg border border-edge bg-surface px-3 py-2.5 text-sm"
					role="status"
				>
					{#if current}
						<p class="font-mono text-xs tracking-widest text-muted">
							TURN {current.number} · {PLAYER_LABEL[current.actor]}
						</p>
						<ul class="mt-1 space-y-0.5 text-body">
							{#each current.moves as m, i (i)}
								<li>{describeMove(m.move, m)}</li>
							{:else}
								<li>A pass — nothing happens this turn.</li>
							{/each}
						</ul>
					{:else}
						<p class="text-muted">Both players start with a full fixer and no gigs. Press next.</p>
					{/if}
					{#if step === last && outcome.kind === 'win'}
						<p class="mt-2 border-t border-edge pt-2 font-medium text-neon">
							{PLAYER_LABEL[outcome.player]} holds seven or more gigs at the start of turn {outcome.turn}
							— and wins.
						</p>
					{/if}
				</div>
			</div>
		</section>
	</div>

	<section class="space-y-3" aria-labelledby="cheatsheet">
		<h2 id="cheatsheet" class="text-xl font-semibold text-bright">Cheatsheet</h2>
		<Cheatsheet />
	</section>

	<section class="space-y-3" aria-labelledby="next-steps">
		<h2 id="next-steps" class="text-xl font-semibold text-bright">What next</h2>
		<ul class="grid gap-3 sm:grid-cols-3">
			{#each next as item (item.href)}
				<li>
					<a
						href={item.href}
						class="group block h-full rounded-lg border border-edge bg-surface p-4 transition-colors hover:border-neon"
					>
						<span class="font-medium text-bright transition-colors group-hover:text-neon"
							>{item.title} →</span
						>
						<span class="mt-1 block text-sm leading-relaxed text-body">{item.body}</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
</div>
