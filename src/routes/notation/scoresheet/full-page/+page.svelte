<script lang="ts">
	/**
	 * The printable scoresheet — one landscape page, four best-of-three matches, a column per game.
	 *
	 * A page, not a PDF, on purpose: the key and the overtime shading are built from the same
	 * tables the validator reads (`#lib/notation/scoresheet.js`), so the sheet cannot drift from
	 * the notation, and the notation is still v0.1 — a PDF people print would outlive its layout.
	 * "Save as PDF" in the print dialog gives anyone who wants the file.
	 *
	 * **No notes box**, and that is a rule, not an omission: the tournament regulations allow only
	 * objective, public information to be written down, so anything only briefly public — a card seen
	 * in the other player's hand — must not be. A free-text area on a sheet is an invitation to break
	 * that; dice state is the whole record, and the result circle is the only thing besides it.
	 *
	 * **Sixteen rows a game**, the checker's own soft cap (`SHEET_ROWS`). No one has played past it, so
	 * the sheet does not spend paper on turns 17+; that and narrow columns are what let four matches
	 * share a page. The price is writing room: a row is about 4.3 mm tall and a game's ink column
	 * about 35 mm wide, against 6 mm and 53 mm for two matches on a portrait page.
	 *
	 * **Paper size is the printer dialog's to choose.** `@page` asks for landscape and nothing else;
	 * the sheet is a fixed 263 × 193 mm, which fits inside the 8 mm margins of both Letter
	 * (279 × 216) and A4 (297 × 210) — Letter's shorter width is what the 263 was fitted to, and
	 * A4's shorter height is what the 193 was.
	 *
	 * The mark is the site's own (`Mark`), stroked in the sheet's black so it prints on a mono printer.
	 *
	 * **Printing hides everything but the sheet** without touching the root layout: the rule below
	 * targets the layout's own wrapper by the one thing only it contains — a `<main>` holding this
	 * page — rather than editing `Nav` or the layout to know about print.
	 *
	 * Built as a sheet-in-a-page so a second printable (the decklist form in `TODO.md`) can sit
	 * beside it; nothing here assumes there is only one.
	 */
	import Mark from '#lib/components/Mark.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import SheetGame from '#lib/components/notation/SheetGame.svelte';
	import SheetKey from '#lib/components/notation/SheetKey.svelte';
	import { NOTATION_LAUNCHED } from '#lib/notation/launch.js';

	let { data } = $props();

	/** The sheet's own width, 263 mm, in CSS pixels. */
	const SHEET_PX = (263 * 96) / 25.4;

	/**
	 * On screen the sheet is scaled down to fit the column it sits in, rather than scrolling sideways:
	 * a 263 mm sheet is wider than a phone, and than a laptop's article column. `zoom` rather than a
	 * transform, so the layout box shrinks with it and leaves no hole beneath. Print ignores it —
	 * the rule is `@media screen` — and the sheet prints at its true size.
	 */
	let available = $state(0);
	const fit = $derived(available > 0 ? Math.min(1, available / SHEET_PX) : 1);

	const MATCHES = [1, 2, 3, 4];
	const GAMES = [1, 2, 3];
</script>

<Meta
	title="Full-page scoresheet — Nova Notation"
	description="A printable scoresheet for the Cyberpunk TCG, four best-of-three matches to a page, ready for Nova Notation."
	origin={data.origin}
	path="/notation/scoresheet/full-page"
	noindex={!NOTATION_LAUNCHED}
/>

<svelte:head>
	<!-- In the head, not this component's `<style>`: `@page` is global, and a head element leaves
	     with the page, so printing some other route afterwards is not forced to landscape. -->
	<style>
		@page {
			size: landscape;
			margin: 8mm;
		}
	</style>
</svelte:head>

<div class="scoresheet-page space-y-6">
	<div class="flex flex-wrap items-center gap-4 print:hidden">
		<button
			type="button"
			onclick={() => window.print()}
			class="rounded-lg bg-neon px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-bright"
			>Print the scoresheet</button
		>
		<p class="text-sm text-muted">
			Four best-of-three matches to a page, a column per game. Pick
			<strong class="font-medium text-body">Letter</strong> or
			<strong class="font-medium text-body">A4</strong> in the print dialog — the sheet fits both. Turn
			off “headers and footers”, and leave scale at 100%.
		</p>
	</div>

	<div bind:clientWidth={available}>
		<div class="sheet mx-auto" style:--fit={fit} aria-label="Nova Notation scoresheet">
			<div class="sheet-head">
				<span class="brand"><Mark class="size-[6mm] shrink-0" />NOVA NOTATION</span>
				<SheetKey />
			</div>

			<div class="matches">
				{#each MATCHES as match (match)}
					<section class="match" aria-label="Match {match}">
						<div class="match-title">
							<b>MATCH {match}</b>
							<span class="fill">Names <i></i> vs <i></i></span>
							<span class="fill short">Round <i></i></span>
							<span class="fill short">Table <i></i></span>
						</div>
						<div class="games">
							{#each GAMES as game (game)}
								<SheetGame {game} />
							{/each}
						</div>
					</section>
				{/each}
			</div>

			<footer class="sheet-foot">
				<span>Shaded rows 15+ are overtime. Write a pass as <code>..</code></span>
				<span>Draft v0.1 &nbsp;·&nbsp; novastack.gg/notation</span>
			</footer>
		</div>
	</div>
</div>

<style>
	/* The sheet is paper: black ink on white, in millimetres, so what is on screen is what prints.
	   Tailwind's colour tokens are the site's dark theme and deliberately not used inside it. */
	.sheet {
		box-sizing: border-box;
		width: 263mm;
		height: 193mm;
		padding: 4mm 5mm 3mm;
		background: #fff;
		color: #000;
		font-family: var(--font-mono);
		font-size: 2.8mm;
		display: flex;
		flex-direction: column;
		gap: 2mm;
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
	/* The brand and the key share a line: every millimetre saved here is a millimetre of row. */
	.sheet-head {
		display: flex;
		align-items: center;
		gap: 5mm;
		padding-bottom: 1mm;
		border-bottom: 0.4mm solid #000;
	}
	.brand {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 2mm;
		font-weight: 700;
		letter-spacing: 0.15em;
	}
	.matches {
		display: grid;
		flex: 1;
		grid-template-columns: repeat(2, 1fr);
		grid-template-rows: repeat(2, 1fr);
		gap: 2.5mm 5mm;
		min-height: 0;
	}
	.match {
		display: flex;
		flex-direction: column;
		gap: 1mm;
		min-height: 0;
		min-width: 0;
	}
	.match-title {
		display: flex;
		align-items: flex-end;
		gap: 3mm;
		font-size: 2.5mm;
	}
	.fill {
		display: flex;
		flex: 2;
		align-items: flex-end;
		gap: 1mm;
		white-space: nowrap;
	}
	.fill.short {
		flex: 1;
	}
	.fill i {
		flex: 1;
		min-width: 4mm;
		border-bottom: 0.25mm solid #000;
	}
	/* Each game's column is set in a smaller unit than a lone sheet's 1 mm; `SheetGame` scales
	   everything from it. */
	.games {
		--sheet-unit: 0.78mm;
		display: grid;
		flex: 1;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5mm;
		min-height: 0;
	}
	.sheet-foot {
		display: flex;
		justify-content: space-between;
		font-size: 2.2mm;
	}

	@media print {
		/* The layout's wrapper is the one `<div>` whose direct child `<main>` holds this page.
		   Everything in it but `<main>` — nav, verification banner, footer — goes, and the
		   wrapper's `min-h-screen` would otherwise be a second, empty page. */
		:global(div:has(> main .scoresheet-page)) {
			min-height: 0 !important;
		}
		:global(div:has(> main .scoresheet-page) > :not(main)) {
			display: none !important;
		}
		:global(html:has(.scoresheet-page)),
		:global(body:has(.scoresheet-page)) {
			background: #fff !important;
		}
		/* The section's frame (`routes/notation/+layout.svelte`) gives the page its column and padding; a
		   sheet printed on paper has neither. */
		:global(.notation-frame:has(.scoresheet-page)) {
			max-width: none;
			margin: 0;
			padding: 0;
		}
		.sheet {
			box-shadow: none;
		}
	}
</style>
