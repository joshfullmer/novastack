<script lang="ts">
	/**
	 * The landing page. **Art as hero.**
	 *
	 * A fanned collage of seven real card images emerging from behind the nav, with the wordmark, a
	 * one-line description and the search field overlaid below. Reference:
	 * `docs/research/landing-layout.jpg`.
	 *
	 * Four things this page must get right:
	 *
	 * - **Don't import the dataset.** It imports `#lib/cards/landing.js` (1.7 KB) instead: the seven
	 *   curated heroes and the build-time stats line. `/` cannot count 133 cards without downloading
	 *   them, and the counts drift.
	 * - **Don't bury the art.** Near-full opacity, no blur, and a gradient that starts transparent.
	 *   Heavily overlaid, the collage stops selling what the site is.
	 * - **Don't clip it.** The fan runs *up* behind the translucent nav and *wider* than the text
	 *   column, so the section clips horizontally only — `overflow-hidden` cut the tops off the cards.
	 * - **Don't swallow clicks.** The cards are real links, so `pointer-events` is layered
	 *   deliberately: the gradient and the text block sit above the fan and must not intercept them.
	 *
	 * The fan splits its transform across two elements, which is what makes both the hit area and
	 * the hover work:
	 *
	 * - the **anchor** carries the fan position (offset, arc dip, rotation), so its box sits under
	 *   the art it represents. With the position on a child instead, all seven anchors stay stacked
	 *   at the centre and clicking the leftmost card activates whichever one is on top.
	 * - the **inner wrapper** carries only the hover lift, so it composes with the anchor's
	 *   transform instead of having to be added into it. Trying to sum them on one element needs a
	 *   `calc()` over two custom properties, and a custom property has to be registered with
	 *   `@property` before it will interpolate at all — which is a lot of machinery for a 12px lift.
	 */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { landing } from '#lib/cards/landing.js';
	import CardImage from '#lib/components/CardImage.svelte';
	import { PARAM } from '#lib/filters/state.js';

	const CENTRE = (landing.heroes.length - 1) / 2;

	/** Spacing as a share of a card's own width: just under 1 gives a slight overlap. */
	const SPACING = 0.9;
	const ROTATION_STEP_DEG = 2.4;
	const DIP_STEP_REM = 1.5;

	function fanStyle(index: number): string {
		const offset = index - CENTRE;
		return [
			`--fan-x: ${offset * SPACING * 100}%`,
			`--fan-y: ${Math.abs(offset) * DIP_STEP_REM}rem`,
			`--fan-rotate: ${offset * ROTATION_STEP_DEG}deg`,
			// The centre card sits on top, so the fan reads as a fan rather than a staircase.
			`z-index: ${landing.heroes.length - Math.abs(Math.round(offset))}`
		].join('; ');
	}

	/** Only the middle three survive below `lg`; seven abreast needs the width. */
	const isWideOnly = (index: number) => Math.abs(index - CENTRE) > 1;

	let query = $state('');

	async function search(event: SubmitEvent) {
		// Progressive enhancement: the form works without this handler, but a blank submit would
		// leave `?search=` behind, and a cleared filter must be an *absent* param.
		event.preventDefault();
		const trimmed = query.trim();
		await goto(trimmed === '' ? '/cards' : `/cards?${PARAM.search}=${encodeURIComponent(trimmed)}`);
	}
</script>

<svelte:head>
	<title>novastack — an unofficial Cyberpunk TCG card database</title>
	<meta
		name="description"
		content="Browse and filter every card in the Cyberpunk TCG. {landing.stats
			.cards} cards, {landing.stats.printings} printings, {landing.stats.sets} sets."
	/>
</svelte:head>

<!-- Clips horizontally only: the fan is wider than the text column but must overflow upward. -->
<section class="relative overflow-x-clip">
	<!-- `-mt-nav` pulls the fan up so the cards emerge from behind the translucent nav. -->
	<div class="pointer-events-none relative -mt-nav h-[46vw] lg:h-[26vw]">
		<div class="absolute inset-x-0 top-0 flex justify-center">
			{#each landing.heroes as hero, index (hero.slug)}
				<a
					href={resolve('/cards/[slug]', { slug: hero.slug })}
					title={hero.name}
					style={fanStyle(index)}
					class={[
						`group pointer-events-auto absolute top-0 w-[30vw] origin-bottom
						translate-x-[var(--fan-x)] translate-y-[var(--fan-y)] rotate-[var(--fan-rotate)]
						focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neon
						lg:w-[13.5vw]`,
						// Not a `class:` directive — `class:lg:block` is not valid syntax, and the colon
						// silently swallows the responsive variant, leaving four cards hidden at every size.
						isWideOnly(index) && 'hidden lg:block'
					]}
				>
					<div
						class="overflow-hidden rounded-xl shadow-2xl shadow-black/60 transition-transform
							duration-300 ease-out group-hover:-translate-y-3 group-focus-visible:-translate-y-3"
					>
						<CardImage
							printingId={hero.printingId}
							thumbhash={hero.thumbhash}
							color={hero.color}
							alt={hero.name}
							sizes="(min-width: 1024px) 13.5vw, 30vw"
							eager
						/>
					</div>
				</a>
			{/each}
		</div>

		<!--
			Starts transparent, so the art is never fogged where it matters, and dissolves the card
			bottoms into the page rather than letting them end on a hard edge.

			`z-10` is load-bearing: the fan's cards carry explicit z-indices (1–7) to stack the centre
			card on top, which would otherwise paint them *above* this overlay and defeat it entirely.
			It stays `pointer-events-none`, so the cards underneath are still clickable.
		-->
		<div class="absolute inset-0 z-10 bg-gradient-to-t from-void via-void/70 to-transparent"></div>
	</div>

	<!-- `z-20` clears the fan's fade overlay, which sits at `z-10` above the cards. -->
	<div class="relative z-20 mx-auto -mt-20 max-w-2xl px-4 pb-24 text-center sm:-mt-28 sm:px-6">
		<h1 class="text-5xl font-semibold tracking-tight text-bright drop-shadow-lg sm:text-6xl">
			nova<span class="text-neon">stack</span>
		</h1>
		<p class="mx-auto mt-3 max-w-md text-balance text-muted">
			Every card in the Cyberpunk TCG — searchable, filterable, and shown at full art.
		</p>

		<form action="/cards" method="GET" onsubmit={search} class="mt-8 flex gap-2">
			<label for="landing-search" class="sr-only">Search cards</label>
			<input
				id="landing-search"
				name={PARAM.search}
				bind:value={query}
				type="search"
				placeholder="Search cards…"
				autocomplete="off"
				class="min-w-0 flex-1 rounded-lg border border-edge
					bg-surface/80 px-4 py-3 text-bright shadow-xl shadow-black/40 transition-colors outline-none placeholder:text-muted
					focus:border-neon"
			/>
			<button
				type="submit"
				class="shrink-0 rounded-lg bg-neon px-5 py-3 font-medium text-void transition-colors
					hover:bg-bright">Go</button
			>
		</form>

		<p class="mt-6 text-sm text-muted">
			<span class="font-medium text-body tabular-nums">{landing.stats.cards}</span> cards ·
			<span class="font-medium text-body tabular-nums">{landing.stats.printings}</span> printings ·
			<span class="font-medium text-body tabular-nums">{landing.stats.sets}</span> sets
		</p>

		<a
			href="/cards"
			class="mt-8 inline-block text-sm text-neon underline decoration-dotted underline-offset-4
				transition-colors hover:text-bright"
		>
			Browse the whole database →
		</a>
	</div>
</section>
