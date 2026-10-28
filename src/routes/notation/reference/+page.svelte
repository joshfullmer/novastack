<script lang="ts">
	/**
	 * The Nova Notation reference — and the notation's spec. There is no separate document: the move
	 * table, die letters, structure rows and win thresholds all render from `#lib/notation`, and every
	 * worked example is asserted against the validator in `reference.spec.ts`, so this page cannot
	 * say something the checker does not do. Same mechanism as `/syntax`.
	 *
	 * **Game rules carry a citation chip.** Each one the checker enforces shows the Comprehensive
	 * Rules section behind it — or a "pending" chip until the owner's audit fills `RULES[].cr` in.
	 * Conventions about how a Transcript is *written* are listed apart, with nothing to cite.
	 */
	import Board from '#lib/components/notation/Board.svelte';
	import NotationLine from '#lib/components/notation/NotationLine.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import PageHeader from '#lib/components/notation/PageHeader.svelte';
	import {
		ACTION_NAME,
		DIE_LETTERS,
		OVERTIME_START,
		PLAYER_LABEL,
		SYNTAX_HELP,
		WIN_DICE,
		analyzeDocument,
		formatGig
	} from '#lib/notation/index.js';
	import type { GameReport, Outcome } from '#lib/notation/index.js';
	import { NOTATION_LAUNCHED } from '#lib/notation/launch.js';
	import {
		CONVENTIONS,
		DESIGN_NOTES,
		GRAMMAR,
		MOVES,
		RULES,
		example
	} from '#lib/notation/reference.js';
	import type { SyntaxKind } from '#lib/notation/index.js';

	let { data } = $props();

	const code = 'rounded bg-raised px-1 py-0.5 text-sm';

	/** The die letters, from the lib. */
	const dieLegend = Object.entries(DIE_LETTERS);

	/** What each piece of a line is called, with a sample — the help text is the hover's own. */
	const structure: { sample: string; kind: SyntaxKind }[] = [
		{ sample: 'first: WE', kind: 'header' },
		{ sample: '3|', kind: 'prefix' },
		{ sample: '..', kind: 'pass' },
		{ sample: '(-A’2)', kind: 'reaction' },
		{ sample: '; note', kind: 'comment' }
	];

	const anatomy = [
		{ char: 'x', label: 'Action', note: 'blank = roll' },
		{ char: 'B', label: 'Die', note: 'A – F' },
		{ char: '’', label: 'Die Owner', note: 'blank = WE' },
		{ char: '3', label: 'Value', note: '1 – sides' }
	];

	const valid = example('valid-game');
	const validReport = analyzeDocument(valid.transcript);

	function outcomeText(outcome: Outcome): string {
		if (outcome.kind === 'undecided') return 'undecided';
		const how =
			outcome.how === 'start'
				? 'at the start of turn'
				: outcome.how === 'overtime'
					? 'in overtime, on turn'
					: 'as overtime begins, after turn';
		return `${PLAYER_LABEL[outcome.player]} wins ${how} ${outcome.turn}`;
	}

	const gigsOf = (report: GameReport, player: 'w' | 't') =>
		report.state[player].gigs.map(formatGig).join(' ') || '—';

	/** The page's table of contents. Ids match the `id`s on the sections and sub-headings below. */
	const contents = [
		{ id: 'intro', title: 'Intro' },
		{ id: 'anatomy', title: 'Anatomy of a move' },
		{ id: 'moves', title: 'Moves' },
		{
			id: 'structure',
			title: 'Structure',
			children: [{ id: 'grammar', title: 'Grammar' }]
		},
		{
			id: 'turn-order',
			title: 'Turn order',
			children: [{ id: 'reactions', title: 'Reserved: Reactions' }]
		},
		{ id: 'winning', title: 'Winning' },
		{
			id: 'checker',
			title: 'What the checker enforces',
			children: [
				{ id: 'game-rules', title: 'Game rules' },
				{ id: 'conventions', title: 'Conventions' }
			]
		},
		{
			id: 'whole-game',
			title: 'A whole game',
			children: [{ id: 'mistakes', title: 'And one with mistakes' }]
		},
		{ id: 'design', title: 'Why it is built this way' }
	];
</script>

<Meta
	title="Notation reference — novastack"
	description="Nova Notation, in full: the grammar, every move, winning, and the reasoning behind the design."
	origin={data.origin}
	path="/notation/reference"
	noindex={!NOTATION_LAUNCHED}
/>

<!-- Inline `code` spans inside prose that is stored as a plain string. -->
{#snippet rich(text: string)}
	{#each text.split('`') as part, i (i)}
		{#if i % 2}<code class={code}>{part}</code>{:else}{part}{/if}
	{/each}
{/snippet}

<!-- A game rule's Comprehensive Rules citation, or the chip that says there isn't one yet. -->
{#snippet cr(citation: string | null)}
	{#if citation}
		<span
			class="shrink-0 rounded border border-neon-dim/60 px-1.5 py-0.5 font-mono text-[0.65rem] whitespace-nowrap text-neon"
			>CR {citation}</span
		>
	{:else}
		<span
			class="shrink-0 rounded border border-dashed border-edge px-1.5 py-0.5 font-mono text-[0.65rem] whitespace-nowrap text-muted"
			title="Awaiting audit against the Comprehensive Rules">CR §— pending</span
		>
	{/if}
{/snippet}

<!-- A Transcript as numbered lines, every piece of it explaining itself, with any errors beneath. -->
{#snippet game(transcript: string)}
	{@const report = analyzeDocument(transcript)}
	<div class="overflow-x-auto rounded-lg border border-edge bg-surface">
		<ol class="min-w-max py-1 text-sm">
			{#if /^\s*first:/im.test(transcript)}
				<li class="px-3 py-1 font-mono text-xs text-muted">first: {PLAYER_LABEL[report.first]}</li>
			{/if}
			{#each report.turns as turn (turn.number)}
				<li class="flex items-baseline gap-3 px-3 py-1">
					<span
						class="w-6 shrink-0 text-right font-mono text-xs {turn.actor === 'w'
							? 'text-neon'
							: 'text-card-red'}">{turn.number}</span
					>
					<span class="w-10 shrink-0 font-mono text-[0.65rem] tracking-widest text-muted"
						>{PLAYER_LABEL[turn.actor]}</span
					>
					{#if turn.raw === ''}
						<span class="font-mono text-xs text-muted italic">(blank line)</span>
					{:else}
						<NotationLine {turn} />
					{/if}
				</li>
			{/each}
		</ol>
		{#if report.errors.length}
			<ul class="space-y-1 border-t border-edge px-3 py-2">
				{#each report.errors as error, i (i)}
					<li class="flex gap-3 text-xs">
						<span class="w-6 shrink-0 text-right font-mono text-card-red">T{error.turn}</span>
						<span class="text-body">
							<span class="font-mono text-bright">{error.raw || '(blank)'}</span>
							<span class="text-muted"> — {error.reason}</span>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

<PageHeader title="Reference" />

<div>
	<div class="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
		<nav
			aria-label="Contents"
			class="mb-10 text-sm lg:sticky lg:top-[calc(var(--spacing-nav)+2rem)] lg:mb-0 lg:max-h-[calc(100dvh-var(--spacing-nav)-4rem)] lg:self-start lg:overflow-y-auto"
		>
			<p class="mb-2 font-mono text-xs tracking-widest text-muted">CONTENTS</p>
			<ol class="space-y-1.5 border-l border-edge">
				{#each contents as item (item.id)}
					<li>
						<a
							href="#{item.id}"
							class="-ml-px block border-l border-transparent py-0.5 pl-3 text-body transition-colors hover:border-neon hover:text-neon"
							>{item.title}</a
						>
						{#if item.children}
							<ol class="mt-1 space-y-1">
								{#each item.children as child (child.id)}
									<li>
										<a
											href="#{child.id}"
											class="-ml-px block border-l border-transparent py-0.5 pl-6 text-muted transition-colors hover:border-neon hover:text-neon"
											>{child.title}</a
										>
									</li>
								{/each}
							</ol>
						{/if}
					</li>
				{/each}
			</ol>
		</nav>
		<article class="max-w-3xl min-w-0 space-y-12">
			<section id="intro" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">Intro</h2>
				<p class="mt-3 leading-relaxed text-body">
					A compact, handwriting-first way to record the dice state of a Cyberpunk TCG game — for a
					pen-and-paper scoresheet at a tournament, and for checking the result by machine. This
					page is the whole specification. Every piece of notation on it explains itself if you
					hover it, focus it, or tap it.
				</p>
			</section>

			<section id="anatomy" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">Anatomy of a move</h2>
				<p class="mt-2 leading-relaxed text-body">
					A move is two to four characters. The letter names the die, a trailing prime marks the
					other player’s die, and the value is what it now shows. <strong
						class="font-medium text-bright">Who acted is never written</strong
					>
					— it comes from the Turn. The one exception in shape is a swap, which names two dice and no
					value: <code class={code}>A&lt;&gt;B'</code>.
				</p>
				<div class="mt-4 flex flex-wrap items-start gap-x-10 gap-y-6">
					<div class="flex gap-6">
						{#each anatomy as part (part.label)}
							<div class="flex flex-col items-center gap-1.5">
								<span class="font-mono text-4xl leading-none text-bright">{part.char}</span>
								<span class="h-4 w-px bg-edge"></span>
								<span class="text-xs tracking-wide text-body uppercase">{part.label}</span>
								<span class="font-mono text-[0.65rem] text-muted">{part.note}</span>
							</div>
						{/each}
					</div>
					<dl class="grid grid-cols-6 gap-1.5">
						{#each dieLegend as [letter, sides] (letter)}
							<div
								class="flex flex-col items-center rounded border border-edge bg-surface px-2.5 py-1.5"
							>
								<dt class="font-mono text-lg leading-none text-bright">{letter}</dt>
								<dd class="font-mono text-[0.65rem] text-muted">d{sides}</dd>
							</div>
						{/each}
					</dl>
				</div>
			</section>

			<section id="moves" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">Moves</h2>
				<p class="mt-2 leading-relaxed text-body">
					The seven moves. Every demo is a whole Transcript, so the Turn it falls on is a Turn its
					player owns.
				</p>
				<div class="mt-4 space-y-4">
					{#each MOVES as move (move.action)}
						{@const report = analyzeDocument([...move.setup, move.demo].join('\n'))}
						<div class="overflow-hidden rounded-lg border border-edge">
							<div class="flex items-center gap-3 border-b border-edge bg-raised/60 px-3 py-2">
								<span class="w-6 text-center font-mono text-xl leading-none text-neon"
									>{move.action || '·'}</span
								>
								<h3 class="font-medium text-bright">{ACTION_NAME[move.action]}</h3>
							</div>
							<dl class="grid gap-x-4 gap-y-1 px-3 py-3 text-sm sm:grid-cols-[5.5rem_1fr]">
								<dt class="text-muted">Effect</dt>
								<dd class="text-body">{move.effect}</dd>
								<dt class="text-muted">Legal when</dt>
								<dd class="text-body">{move.legal}</dd>
							</dl>
							<div class="space-y-2 px-3 pb-3">
								{@render game([...move.setup, move.demo].join('\n'))}
								<p class="font-mono text-xs text-muted">
									<span class="text-neon">WE</span>
									{gigsOf(report, 'w')}
									<span class="mx-1">·</span>
									<span class="text-card-red">THEY</span>
									{gigsOf(report, 't')}
								</p>
							</div>
						</div>
					{/each}
				</div>
				<p class="mt-3 text-sm text-muted">
					Any player may modify any Gig die on their Turn, including dice the Rival controls.
					Stealing your own die back is a Steal.
				</p>
			</section>

			<section id="structure" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">Structure</h2>
				<p class="mt-2 leading-relaxed text-body">
					A Transcript is an optional header, then one Turn per line. Whitespace between entries is
					required on paper for legibility, though the parser tolerates its absence.
				</p>
				<dl class="mt-3 divide-y divide-edge/40 rounded-lg border border-edge/60">
					{#each structure as row (row.kind)}
						<div class="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[8rem_1fr] sm:gap-4">
							<dt class="font-mono text-bright">{row.sample}</dt>
							<dd class="text-body">{SYNTAX_HELP[row.kind]}</dd>
						</div>
					{/each}
				</dl>
				<h3
					id="grammar"
					class="mt-5 scroll-mt-[calc(var(--spacing-nav)+1rem)] font-medium text-bright"
				>
					Grammar
				</h3>
				<pre
					class="mt-2 overflow-x-auto rounded-lg border border-edge bg-surface p-4 font-mono text-xs leading-relaxed text-body">{GRAMMAR}</pre>
			</section>

			<section id="turn-order" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">Turn order</h2>
				<p class="mt-2 leading-relaxed text-body">
					Odd Turns belong to the first player, even Turns to the second; the <code class={code}
						>first:</code
					> header says who that is, and without it WE went first.
				</p>
				<div class="mt-3">{@render game(example('turn-order').transcript)}</div>
				<p class="mt-4 leading-relaxed text-body">
					Every Turn begins with one <strong class="font-medium text-bright">Roll</strong>: a die
					from your Fixer, rolled in and placed in your Gigs, before anything else. A player has six
					dice, so after six Turns the Fixer is empty and there is nothing left to roll. That is
					also when a Turn may be a pass —
					<code class={code}>..</code>.
				</p>
				<h3
					id="reactions"
					class="mt-6 scroll-mt-[calc(var(--spacing-nav)+1rem)] font-medium text-bright"
				>
					Reserved: Reactions
				</h3>
				<p class="mt-1 text-sm leading-relaxed text-muted">
					Cards can be played in the React Step (§9.7), where the defending player may react to an
					attack, but no card in the current pool changes a die there — so there is nothing to write
					down yet. The syntax is held in reserve for when one does. Parentheses wrap a <strong
						class="font-medium text-body">Reaction</strong
					>: a move the non-active player made during the active player’s Turn, written where it
					resolved, in resolution order rather than declaration order. A Reaction may change values
					only — never Roll, Steal or Swap — and the checker already understands it.
				</p>
				<div class="mt-3">{@render game(example('reaction').transcript)}</div>
			</section>

			<section id="winning" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">Winning</h2>
				<ul class="mt-2 list-disc space-y-2 pl-5 leading-relaxed text-body marker:text-muted">
					<li>
						<strong class="font-medium text-bright">Regulation.</strong> A player who starts their
						own Turn controlling {WIN_DICE} or more Gigs wins. The win is declared at the start of that
						Turn, so it can land on a row never written: a sheet that ends after turn {validReport
							.turns.length - 1}
						with WE holding {validReport.state.w.gigs.length} dice reads “{outcomeText(
							validReport.outcome
						)}”.
					</li>
					<li>
						<strong class="font-medium text-bright">Overtime.</strong> Overtime begins as turn {OVERTIME_START -
							1} ends — one die a turn, six each, has emptied both Fixers — so turn {OVERTIME_START}
						is always its first. From then on a Steal that brings the actor to {WIN_DICE} wins immediately,
						and a player already holding {WIN_DICE} as it begins wins at once.
					</li>
					<li>
						<strong class="font-medium text-bright">Undecided.</strong> The checker declares a win only
						at the start of the Turn immediately after the last one written. If the Rival’s intervening
						Turn is missing, the outcome is undecided.
					</li>
				</ul>
				<details class="mt-4 rounded-lg border border-edge/60">
					<summary class="cursor-pointer px-3 py-2 text-sm text-body hover:text-bright"
						>Undecided: the worked game, without its last Turn</summary
					>
					<div class="p-3">{@render game(example('undecided').transcript)}</div>
				</details>
				<details class="mt-2 rounded-lg border border-edge/60">
					<summary class="cursor-pointer px-3 py-2 text-sm text-body hover:text-bright"
						>Overtime: a Steal to {WIN_DICE} on turn {OVERTIME_START}</summary
					>
					<div class="p-3">{@render game(example('overtime').transcript)}</div>
				</details>
			</section>

			<section id="checker" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">What the checker enforces</h2>
				<p class="mt-2 leading-relaxed text-body">
					Two kinds of rule. The <strong class="font-medium text-bright">game rules</strong> are the
					Cyberpunk TCG’s own, each with the section of the Comprehensive Rules that backs it. The
					<strong class="font-medium text-bright">conventions</strong> are only about how a Transcript
					is written.
				</p>
				<h3
					id="game-rules"
					class="mt-4 scroll-mt-[calc(var(--spacing-nav)+1rem)] font-medium text-bright"
				>
					Game rules
				</h3>
				<ul class="mt-2 divide-y divide-edge/40 rounded-lg border border-edge/60">
					{#each RULES as rule (rule.id)}
						<li class="flex items-start justify-between gap-3 px-3 py-2 text-sm">
							<span class="text-body">{rule.text}</span>
							{@render cr(rule.cr)}
						</li>
					{/each}
				</ul>
				<h3
					id="conventions"
					class="mt-5 scroll-mt-[calc(var(--spacing-nav)+1rem)] font-medium text-bright"
				>
					Conventions
				</h3>
				<ul
					class="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-body marker:text-muted"
				>
					{#each CONVENTIONS as convention (convention)}
						<li>{@render rich(convention)}</li>
					{/each}
				</ul>
			</section>

			<section id="whole-game" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">A whole game</h2>
				<p class="mt-2 leading-relaxed text-body">
					Ten Turns. Hover any move to read what it did. {outcomeText(validReport.outcome)}.
				</p>
				<div class="mt-3 grid items-start gap-4 md:grid-cols-2">
					{@render game(valid.transcript)}
					<Board state={validReport.state} />
				</div>
				<h3
					id="mistakes"
					class="mt-6 scroll-mt-[calc(var(--spacing-nav)+1rem)] font-medium text-bright"
				>
					And one with mistakes
				</h3>
				<p class="mt-2 text-sm leading-relaxed text-body">
					Every line the checker refuses, with its reason. The board keeps threading past each
					error, so one slip does not hide the rest.
				</p>
				<div class="mt-3">{@render game(example('invalid-game').transcript)}</div>
			</section>

			<section id="design" class="scroll-mt-[calc(var(--spacing-nav)+1rem)]">
				<h2 class="text-xl font-semibold text-bright">Why it is built this way</h2>
				<dl class="mt-3 space-y-4">
					{#each DESIGN_NOTES as note (note.title)}
						<div class="border-l-2 border-neon/60 pl-4">
							<dt class="font-medium text-bright">{note.title}</dt>
							<dd class="mt-1 text-sm leading-relaxed text-body">{@render rich(note.body)}</dd>
						</div>
					{/each}
				</dl>
				<p class="mt-4 text-sm text-muted">
					A steal that changes the value, written as two moves: turn 2 takes the die, then lowers
					it.
				</p>
				<div class="mt-2">{@render game(example('steal-then-change').transcript)}</div>
			</section>
		</article>
	</div>
</div>
