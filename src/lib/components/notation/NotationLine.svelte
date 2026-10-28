<script lang="ts">
	/**
	 * One Turn of a Transcript, written out as notation with every piece explaining itself on
	 * hover, focus or tap (`NotationToken`).
	 *
	 * The line is cut by `splitTurn`, the same function the parser reads it with, so what is
	 * underlined is exactly what was parsed. Each move token is matched back to its `MoveReport` by
	 * text, in order; a token the parser refused has no report and is drawn plain red. A refused
	 * move *does* have one, and its tooltip carries the reason instead of a description.
	 *
	 * Display only — never an input. Typing happens in a `<textarea>`, which has no hover.
	 */
	import { SYNTAX_HELP, describeMove, splitTurn } from '#lib/notation/index.js';
	import type { MoveReport, TurnReport } from '#lib/notation/index.js';
	import NotationToken from './NotationToken.svelte';

	/** A real space character — a bare `{' '}` in the template is a lint error. */
	const SPACE = ' ';

	let {
		turn,
		prefix = false,
		ink = false
	}: {
		turn: TurnReport;
		prefix?: boolean;
		/** Written on paper (`SheetGame`): ink takes the colour of the page it sits on. */
		ink?: boolean;
	} = $props();

	const tone = $derived({
		move: ink ? 'text-inherit' : 'text-bright',
		fault: ink ? 'text-red-700' : 'text-card-red',
		quiet: ink ? 'text-inherit opacity-60' : 'text-muted'
	});

	type Item =
		| { kind: 'reaction' | 'pass'; token: string }
		| { kind: 'move'; token: string; report: MoveReport }
		| { kind: 'unknown'; token: string };

	const parts = $derived(splitTurn(turn.raw));

	const items = $derived.by((): Item[] => {
		let next = 0;
		return parts.tokens.map((token): Item => {
			if (token === '(' || token === ')') return { kind: 'reaction', token };
			if (token === '..') return { kind: 'pass', token };
			const report = turn.moves[next];
			if (report?.move.raw !== token) return { kind: 'unknown', token };
			next++;
			return { kind: 'move', token, report };
		});
	});

	function tipFor(report: MoveReport): string {
		if (report.error) return `Not legal — ${report.error}`;
		return describeMove(report.move, report);
	}
</script>

<!--
	The gaps between tokens are real spaces, emitted as `{gap}` text rather than left to template
	whitespace, so that selecting a line and pasting it into the checker gives back valid notation
	(`C8 -B1 (-A'2)`, not `C8-B1(-A'2)`) and a reaction hugs its parentheses exactly as written.
-->
<span class="font-mono">
	{#if prefix && parts.prefix}
		<NotationToken tip={SYNTAX_HELP.prefix} onPaper={ink} class={tone.quiet}
			>{parts.prefix.text}</NotationToken
		>{SPACE}
	{/if}
	{#each items as item, i (i)}
		{@const gap = i > 0 && items[i - 1].token !== '(' && item.token !== ')' ? SPACE : ''}
		{gap}{#if item.kind === 'move'}<NotationToken
				tip={tipFor(item.report)}
				onPaper={ink}
				class={item.report.error ? tone.fault : tone.move}>{item.token}</NotationToken
			>{:else if item.kind === 'unknown'}<span class={tone.fault}>{item.token}</span
			>{:else}<NotationToken tip={SYNTAX_HELP[item.kind]} onPaper={ink} class={tone.quiet}
				>{item.token}</NotationToken
			>{/if}
	{/each}
</span>
