<script lang="ts">
	/**
	 * Everything a writer needs at the table, on one card: the dice, the moves, how a line is put
	 * together, how a game ends.
	 *
	 * The dice, the move names and the win numbers are read from the notation's own tables
	 * (`DIE_LETTERS`, `ACTION_NAME`, `WIN_DICE`, `OVERTIME_START`), so the card cannot disagree with the
	 * checker. The one-line meanings are hand-written, in the same first-person voice as the intro —
	 * "my Rival" rather than THEY — because this is for someone still learning the vocabulary; the
	 * reference page is where the sheet's own words live.
	 *
	 * No Reactions: no card in the current pool changes a die in the React Step (see `docs/spec/notation.md`).
	 */
	import {
		ACTION_NAME,
		DIE_LETTERS,
		OVERTIME_START,
		WIN_DICE,
		parseMove
	} from '#lib/notation/index.js';

	const dice = Object.entries(DIE_LETTERS);

	/** `code` is parsed, so the name beside it is whatever the checker would call that move. */
	const moves = [
		{ code: 'B4', means: 'Roll my d6. It shows 4.' },
		{ code: "xB'", means: "Steal my Rival's d6. It keeps its value, so none is written." },
		{ code: '+B5', means: 'Raise a die in play to 5.' },
		{ code: '-B2', means: 'Lower a die in play to 2.' },
		{ code: '=B3', means: 'Set a die in play to 3, up or down.' },
		{ code: '~B6', means: 'Reroll a die in play. It now shows 6.' },
		{
			code: "A<>B'",
			means: "Swap my d4 with my Rival's d6. Both keep their values; it is not a steal."
		}
	].map((move) => ({ ...move, name: ACTION_NAME[parseMove(move.code)!.action] }));
</script>

<div
	class="grid gap-x-8 gap-y-6 rounded-lg border border-edge bg-surface p-5 md:grid-cols-[auto_1fr]"
>
	<section aria-labelledby="cheat-dice">
		<h3 id="cheat-dice" class="font-mono text-xs tracking-widest text-muted">DICE</h3>
		<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
			{#each dice as [letter, sides] (letter)}
				<dt class="text-neon">{letter}</dt>
				<dd class="text-body">d{sides}</dd>
			{/each}
		</dl>
		<p class="mt-3 max-w-40 text-sm text-muted">
			A trailing <code class="font-mono text-body">’</code> is my Rival’s die:
			<code class="font-mono text-body">B’</code> is their d6.
		</p>
	</section>

	<section aria-labelledby="cheat-moves">
		<h3 id="cheat-moves" class="font-mono text-xs tracking-widest text-muted">MOVES</h3>
		<dl class="mt-2 grid grid-cols-[4.5rem_6.5rem_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm">
			{#each moves as move (move.code)}
				<dt class="font-mono text-neon">{move.code}</dt>
				<dd class="text-bright">{move.name}</dd>
				<dd class="text-body">{move.means}</dd>
			{/each}
			<dt class="font-mono text-neon">..</dt>
			<dd class="text-bright">Pass</dd>
			<dd class="text-body">Do nothing this turn. Never leave a line blank.</dd>
		</dl>
	</section>

	<section aria-labelledby="cheat-line" class="md:col-span-2">
		<h3 id="cheat-line" class="font-mono text-xs tracking-widest text-muted">ONE LINE, ONE TURN</h3>
		<ul
			class="mt-2 grid list-disc gap-x-8 gap-y-1 pl-5 text-sm text-body marker:text-muted md:grid-cols-2"
		>
			<li>
				Moves go in the order they happened: <code class="font-mono text-bright">B4 -B2</code>.
			</li>
			<li>
				Nobody writes <em>who</em> — turns alternate, starting with whoever went first.
			</li>
			<li>
				Start your turn holding <strong class="font-medium text-bright">{WIN_DICE}</strong> or more gigs
				and you win.
			</li>
			<li>
				From turn <strong class="font-medium text-bright">{OVERTIME_START}</strong>, a steal that
				gets you to {WIN_DICE} wins on the spot.
			</li>
		</ul>
	</section>
</div>
