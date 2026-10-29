<script lang="ts">
	/**
	 * The scoresheet's key: one move taken apart, then the dice and the actions written as examples.
	 * Paper, black ink, in millimetres like the sheet it sits on. Read from `#lib/notation/scoresheet.js`,
	 * so it cannot disagree with the checker.
	 */
	import { actionKey, anatomy, diceKey } from '#lib/notation/scoresheet.js';
</script>

<div class="anatomy" aria-label="A move, taken apart">
	<span class="word">
		{#each anatomy.parts as part (part.label)}
			<span class="part"><b>{part.text}</b><i>{part.label}</i></span>
		{/each}
	</span>
	<span class="says">{anatomy.says}</span>
</div>

<dl class="key">
	<dt>DICE</dt>
	<dd>
		{#each diceKey as { letter, sides } (letter)}<span><b>{letter}</b> d{sides}</span>{/each}
		<span class="theirs"><b>'</b> = theirs</span>
	</dd>
	<dt>ACTIONS</dt>
	<dd>
		{#each actionKey as { code, name } (code)}<span><b>{code}</b> {name}</span>{/each}
		<span><b>..</b> pass</span>
	</dd>
</dl>

<style>
	.anatomy {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 2.5mm;
		padding: 0.5mm 2mm;
		border: 0.25mm solid #000;
	}
	.word {
		display: flex;
		gap: 1.2mm;
	}
	.part {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.1;
	}
	.part b {
		font-size: 4mm;
	}
	.part i {
		padding-top: 0.3mm;
		border-top: 0.2mm solid #000;
		font-size: 1.7mm;
		font-style: normal;
	}
	.says {
		font-size: 2.2mm;
	}
	.says::before {
		content: '→ ';
	}
	.key {
		display: grid;
		flex: 1;
		grid-template-columns: auto 1fr;
		gap: 0.6mm 2mm;
		margin: 0;
		font-size: 2.4mm;
	}
	dt {
		font-weight: 700;
		letter-spacing: 0.06em;
	}
	dd {
		display: flex;
		flex-wrap: wrap;
		gap: 0 2.2mm;
		margin: 0;
	}
	b {
		font-weight: 700;
	}
	.theirs {
		margin-left: 1.5mm;
		padding-left: 2.2mm;
		border-left: 0.2mm solid #000;
	}
</style>
