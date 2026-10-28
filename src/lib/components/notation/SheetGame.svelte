<script lang="ts">
	/**
	 * One game's column on the scoresheet — paper, black ink, a printed number on every row.
	 *
	 * Shared by the printable sheet (`/notation/scoresheet`, three of these, blank) and the front
	 * door (one, filled with the worked game), so the picture that *teaches* the notation is the same
	 * object people will actually hold. Leave `turns` off for a blank column; pass them to write the
	 * game in.
	 *
	 * **Everything is sized in `--u`** — one millimetre on the printed sheet, a little more on screen
	 * — so one set of proportions serves both. Rows normally share whatever height the sheet gives
	 * them; `--row-min` is for the screen, where nothing gives them any.
	 *
	 * **Paper is not the site's dark theme**, on purpose: the colours are literal. Hover text still
	 * floats above it in the site's own style, because that is the part that is not on the paper.
	 *
	 * With `onselect`, the printed turn number becomes a button — the one thing on a real sheet that
	 * is never written, and so the one thing safe to make clickable. Rows past `step` are drawn
	 * faint: the record exists, the reader just has not got there yet.
	 */
	import { PLAYER_LABEL } from '#lib/notation/index.js';
	import type { Owner, TurnReport } from '#lib/notation/index.js';
	import { sheetRows } from '#lib/notation/scoresheet.js';
	import NotationLine from './NotationLine.svelte';

	let {
		game,
		turns,
		step = 0,
		first = 'w',
		rows,
		onselect
	}: {
		game: number;
		turns?: TurnReport[];
		/** How many turns the reader has reached; the row for this turn is highlighted. */
		step?: number;
		first?: Owner;
		/**
		 * Show only this many rows, with the sheet fading out below them and no result box —
		 * a glimpse of the sheet rather than the whole column. Leave off for the full column.
		 */
		rows?: number;
		onselect?: (turn: number) => void;
	} = $props();

	const filled = $derived(turns !== undefined);
	const shown = $derived(rows === undefined ? sheetRows : sheetRows.slice(0, rows));
</script>

<section class="game" class:cropped={rows !== undefined} aria-label="Game {game}">
	<div class="game-head">
		<b>GAME {game}</b>
		<span>
			first:
			<span class="option" class:marked={filled && first === 'w'}>{PLAYER_LABEL.w}</span>
			<span class="option" class:marked={filled && first === 't'}>{PLAYER_LABEL.t}</span>
		</span>
	</div>
	<ol class="rows">
		{#each shown as row (row.turn)}
			{@const turn = turns?.[row.turn - 1]}
			<li
				class:shaded={row.shaded}
				class:overtime={row.overtime}
				class:active={filled && step === row.turn}
				class:ahead={filled && step < row.turn}
			>
				{#if onselect && turn}
					<button
						type="button"
						class="num"
						onclick={() => onselect(row.turn)}
						aria-label="Show the board after turn {row.turn}"
						aria-current={step === row.turn ? 'step' : undefined}>{row.turn}</button
					>
				{:else}
					<span class="num">{row.turn}</span>
				{/if}
				<span class="ink">
					{#if turn}<NotationLine {turn} ink />{/if}
				</span>
			</li>
		{/each}
	</ol>
	{#if rows === undefined}
		<div class="result">
			result:
			<span class="option">{PLAYER_LABEL.w}</span>
			<span class="option">{PLAYER_LABEL.t}</span>
			<span class="option">draw</span>
		</div>
	{/if}
</section>

<style>
	.game {
		/* A wrapper sets `--sheet-unit` to scale the whole column; the printed sheet leaves it at 1mm. */
		--u: var(--sheet-unit, 1mm);
		display: flex;
		flex-direction: column;
		min-width: 0;
		border: calc(var(--u) * 0.35) solid #000;
		background: #fff;
		color: #111;
		font-family: var(--font-mono);
		font-size: calc(var(--u) * 3.2);
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}
	/* A cropped sheet runs off into the page instead of ending: a scrim in the page's own colour over
	   its last rows. Not a `mask`, which would clip the hover text that hangs below a token. */
	.game.cropped {
		position: relative;
	}
	.game.cropped::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 15%;
		background: linear-gradient(to bottom, transparent, var(--color-void));
		pointer-events: none;
	}
	.game-head,
	.result {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(var(--u) * 2);
		padding: calc(var(--u) * 0.8) calc(var(--u) * 1.5);
	}
	.game-head {
		border-bottom: calc(var(--u) * 0.35) solid #000;
	}
	.result {
		justify-content: flex-start;
		border-top: calc(var(--u) * 0.35) solid #000;
	}
	/* The options are printed plain: circling one is the player's job, with their own pen. Only a
	   filled sheet — the front door's worked game — shows one already circled, as a player would,
	   wobbly on purpose. The box is always there, transparent, so marking one moves nothing. */
	.option {
		display: inline-block;
		padding: 0 calc(var(--u) * 1);
		border: calc(var(--u) * 0.35) solid transparent;
		line-height: 1.35;
	}
	.option.marked {
		border-color: #1a1a2e;
		border-radius: 52% 48% 55% 45% / 60% 52% 48% 40%;
		rotate: -2deg;
	}
	.rows {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rows li {
		display: flex;
		flex: 1;
		align-items: stretch;
		min-height: var(--row-min, 0);
		border-bottom: calc(var(--u) * 0.2) solid #000;
	}
	.rows li.shaded {
		background: #ececec;
	}
	.rows li.overtime {
		background: #cfcfcf;
	}
	/* The pen-highlighter on the turn being read. After the shading, so it wins. */
	.rows li.active {
		background: #fff3a3;
	}
	.num {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		width: calc(var(--u) * 6);
		padding: 0 calc(var(--u) * 1.2) 0 0;
		border: 0;
		border-right: calc(var(--u) * 0.2) solid #000;
		background: none;
		color: inherit;
		font: inherit;
		font-size: calc(var(--u) * 3);
	}
	button.num {
		cursor: pointer;
	}
	button.num:hover,
	button.num:focus-visible {
		background: #fff3a3;
		outline: none;
	}
	.ink {
		display: flex;
		flex: 1;
		align-items: center;
		padding-left: calc(var(--u) * 1.5);
		font-size: calc(var(--u) * 3.4);
	}
	/* Dimmed by colour, never by `opacity`: opacity fades everything inside the row, and a token's hover
	   text is inside it — the tooltip came out see-through, and the rows below painted over it. */
	.rows li.ahead .ink {
		color: #6b6b6b;
	}
</style>
