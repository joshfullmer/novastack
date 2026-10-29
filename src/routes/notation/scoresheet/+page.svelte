<script lang="ts">
	/**
	 * The notepad sheet — one best-of-three match to a page, the shape of a pad you tear a sheet from.
	 * The full-page scoresheet's little sibling (`full-page/`): the same notation, the same `SheetGame` column and
	 * the same key (`#lib/notation/scoresheet.js`), laid out for one match instead of four.
	 *
	 * **Landscape, on purpose.** Width, not height, is what a handwritten turn runs out of: at A5
	 * portrait a game's ink column was 28 mm and a fifteen-character turn needs 32; landscape gives it
	 * 38 mm for the price of a millimetre or so of row. The match details and the key sit in a column
	 * to the right, so the three games keep the whole height.
	 *
	 * **Fixed 194 × 123 mm**, the largest that fits inside 8 mm margins on both A5 landscape
	 * (210 × 148) and half-letter landscape (215.9 × 139.7) — half-letter's shorter height is what
	 * the 123 was fitted to. Like the scoresheet, **no notes box**: the tournament regulations allow
	 * only objective, public information to be written down.
	 *
	 * The key is the short one: dice, actions as examples, and a QR code to the full notation in
	 * place of the rules text. Reactions are left out — no card in the current pool changes a die in
	 * the React Step.
	 *
	 * Screen fitting and print hiding are the full-page sheet's, and for the same reasons; see there.
	 */
	import Mark from '#lib/components/Mark.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import QrCode from '#lib/components/QrCode.svelte';
	import SheetGame from '#lib/components/notation/SheetGame.svelte';
	import { NOTATION_LAUNCHED } from '#lib/notation/launch.js';
	import { actionKey, diceKey } from '#lib/notation/scoresheet.js';

	let { data } = $props();

	/** The sheet's own width, 194 mm, in CSS pixels. */
	const SHEET_PX = (194 * 96) / 25.4;

	let available = $state(0);
	const fit = $derived(available > 0 ? Math.min(1, available / SHEET_PX) : 1);

	const notationUrl = $derived(`${data.origin}/notation`);
	const GAMES = [1, 2, 3];
</script>

<Meta
	title="Scoresheet — Nova Notation"
	description="A printable scoresheet for the Cyberpunk TCG, one best-of-three match to a page, sized for an A5 or half-letter notepad, ready for Nova Notation."
	origin={data.origin}
	path="/notation/scoresheet"
	noindex={!NOTATION_LAUNCHED}
/>

<svelte:head>
	<!-- In the head, not this component's `<style>`: see the full-page sheet. -->
	<style>
		@page {
			size: landscape;
			margin: 8mm;
		}
	</style>
</svelte:head>

<div class="notepad-page space-y-6">
	<div class="flex flex-wrap items-center gap-4 print:hidden">
		<button
			type="button"
			onclick={() => window.print()}
			class="rounded-lg bg-neon px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-bright"
			>Print the notepad sheet</button
		>
		<p class="text-sm text-muted">
			One best-of-three match to a page, sized for an A5 or half-letter pad. Prints at true size,
			194 × 123 mm. Turn off “headers and footers”, and leave scale at 100%.
		</p>
	</div>

	<div bind:clientWidth={available}>
		<div class="sheet mx-auto" style:--fit={fit} aria-label="Nova Notation notepad sheet">
			<div class="games">
				{#each GAMES as game (game)}
					<SheetGame {game} />
				{/each}
			</div>

			<aside>
				<span class="brand"><Mark class="size-[6mm] shrink-0" />NOVA NOTATION</span>
				<div class="fills">
					<span class="fill">Names <i></i></span>
					<span class="fill">vs <i></i></span>
					<span class="fill">Round <i></i></span>
					<span class="fill">Table <i></i></span>
				</div>
				<section aria-labelledby="key-dice">
					<h2 id="key-dice">DICE</h2>
					<ul class="dice">
						{#each diceKey as { letter, sides } (letter)}
							<li><b>{letter}</b> d{sides}</li>
						{/each}
					</ul>
					<p><b>'</b> = theirs</p>
				</section>
				<section aria-labelledby="key-actions">
					<h2 id="key-actions">ACTIONS</h2>
					<ul>
						{#each actionKey as { code, name } (code)}
							<li><b>{code}</b> {name}</li>
						{/each}
						<li><b>..</b> pass</li>
					</ul>
				</section>
				<div class="full">
					<QrCode url={notationUrl} class="qr" />
					<span>
						<b>FULL NOTATION</b>
						{new URL(notationUrl).host}/notation
						<em>Draft v0.1</em>
					</span>
				</div>
			</aside>
		</div>
	</div>
</div>

<style>
	/* Paper, like the scoresheet: black ink on white, in millimetres, so what is on screen is what
	   prints. Tailwind's colour tokens are the site's dark theme and deliberately not used inside it. */
	.sheet {
		box-sizing: border-box;
		width: 194mm;
		height: 123mm;
		padding: 5mm;
		display: flex;
		gap: 4mm;
		background: #fff;
		color: #000;
		font-family: var(--font-mono);
		font-size: 2.6mm;
		box-shadow: 0 8px 40px rgb(0 0 0 / 0.5);
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
		break-inside: avoid;
	}
	@media screen {
		.sheet {
			zoom: var(--fit, 1);
		}
	}
	/* Tall rows and narrow columns: the turn number and the ink get their own, larger sizes, apart from
	   the lines (see `SheetGame`). */
	.games {
		--sheet-unit: 0.78mm;
		--sheet-num-size: 3.4mm;
		--sheet-num-width: 7mm;
		--sheet-ink-size: 3.4mm;
		--sheet-chrome-size: 2.5mm;
		display: grid;
		flex: 1;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2mm;
		min-width: 0;
	}
	aside {
		display: flex;
		flex-direction: column;
		gap: 2.5mm;
		width: 40mm;
		flex-shrink: 0;
		padding-left: 3mm;
		border-left: 0.4mm solid #000;
		font-size: 2.2mm;
		line-height: 1.45;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 2mm;
		font-size: 2.6mm;
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	.fills {
		display: flex;
		flex-direction: column;
		gap: 1.5mm;
	}
	.fill {
		display: flex;
		align-items: flex-end;
		gap: 1mm;
	}
	.fill i {
		flex: 1;
		border-bottom: 0.25mm solid #000;
	}
	h2 {
		margin: 0 0 0.5mm;
		font-size: 2.1mm;
		letter-spacing: 0.12em;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	p {
		margin: 0.4mm 0 0;
	}
	b {
		font-weight: 700;
	}
	.dice {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	/* Pushed to the bottom-right corner, where a thumb on the pad is least likely to be. */
	.full {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1mm;
		margin-top: auto;
		font-size: 1.9mm;
		line-height: 1.3;
		text-align: right;
	}
	.full :global(.qr) {
		width: 26mm;
		height: 26mm;
	}
	.full span {
		display: flex;
		flex-direction: column;
	}
	.full em {
		font-style: normal;
		opacity: 0.6;
	}

	@media print {
		/* As the scoresheet's: hide everything but the sheet without teaching the layout about print. */
		:global(div:has(> main .notepad-page)) {
			min-height: 0 !important;
		}
		:global(div:has(> main .notepad-page) > :not(main)) {
			display: none !important;
		}
		:global(html:has(.notepad-page)),
		:global(body:has(.notepad-page)) {
			background: #fff !important;
		}
		:global(.notation-frame:has(.notepad-page)) {
			max-width: none;
			margin: 0;
			padding: 0;
		}
		.sheet {
			box-shadow: none;
		}
	}
</style>
