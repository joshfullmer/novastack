<script lang="ts">
	/**
	 * The card detail page. No longer prerendered — see `+page.server.ts`.
	 *
	 * It serves three roles: the shareable card URL, the mobile detail view, and the full-size art
	 * view. Over and above the 320px pane it adds larger art at the 733w tier, a substantial
	 * printings gallery, and the flavour text and per-printing attribution the pane has no room
	 * for.
	 *
	 * **Printing deep-links use a query param on this page, not 389 per-printing routes.** Those
	 * would be SEO duplication, and would duplicate identical art for the 100 cards that are pure
	 * retail/beta mirrors of a single image. The key is `<Category>-<Set Code>-<Collector Number>`,
	 * unique across every printing, with the collector number **verbatim, β included** — an
	 * identifier that does not match the printed card is worse than a percent-encoded one, and β
	 * cannot be reconstructed from the set code.
	 *
	 * **The chooser is a flat list**, every printing, 2 to 6 per card. The accepted cost is that
	 * most entries render an identical image: only 33 cards have more than one artist. The
	 * mitigation is informational rather than visual — entries are labelled with set, collector
	 * number and rarity, so they differ by metadata even when the art does not. The user is
	 * choosing a *printing*, not an art.
	 *
	 * Back-navigation needs no work: filters live in query params, so history returns the reader to
	 * the narrowed grid.
	 */
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { currentUrl } from '#lib/filters/shallow.js';
	import CardImage from '#lib/components/CardImage.svelte';
	import CardMetaBadges from '#lib/components/CardMetaBadges.svelte';
	import CardStats from '#lib/components/CardStats.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import RulesText from '#lib/components/RulesText.svelte';
	import { cardImageUrl, PRINTING_PARAM } from '#lib/cards/schema.js';
	import { findSetIdentifier } from '#lib/cards/sets.js';

	let { data } = $props();

	const card = $derived(data.card);

	/**
	 * The deep-linked printing, or the Default Printing.
	 *
	 * `+page.server.ts` already resolved this correctly for the *initial* response (that's what
	 * lets Open Graph tags reflect a shared `?printing=` link) — `data.printing` is that answer,
	 * and covers the non-browser (server-render) case. The browser branch exists for the
	 * *interactive* chooser below: `choose()` navigates with `shallow: true`, which updates the
	 * URL without a real server round trip, so nothing re-runs `load` — this reactive re-read of
	 * `currentUrl()` is what makes clicking a printing update the art instantly instead of not at
	 * all. Both branches resolve the same param the same way; they just run at different times.
	 */
	const printing = $derived.by(() => {
		if (!browser) return data.printing;
		const key = currentUrl().searchParams.get(PRINTING_PARAM);
		return card.printings.find((entry) => entry.key === key) ?? card.printings[0];
	});

	const set = $derived(findSetIdentifier(printing.setId));

	function choose(key: string) {
		const next = new URL(currentUrl().href);
		// The Default Printing is the absent state, so one printing is one canonical URL.
		if (key === card.printings[0].key) next.searchParams.delete(PRINTING_PARAM);
		else next.searchParams.set(PRINTING_PARAM, key);
		void goto(next, { shallow: true, replace: true });
	}

	const artists = $derived([...new Set(card.printings.map((entry) => entry.artist))]);

	/** Only Legends print a `"<Name> — <Subtitle>"` pair (`legendBaseName()`, `derive.ts`) — every
	 * other Card is one bare name. `nameParts[1]` is `undefined` for those, not an empty string,
	 * so the subtitle line below only renders when there's an actual subtitle to show. */
	const nameParts = $derived(card.name.split(' — '));

	// `rawRulesText` still carries the `{Keyword}` markup `rulesText`'s segments parse out for
	// display — braces stripped, that markup reads as plain, punctuation-adjacent text
	// ("{Spend} A friendly..." → "Spend A friendly...") rather than needing `RulesText`'s own
	// segment-aware rendering, which a plain `<meta content>` string can't use anyway. Vanilla
	// cards (no rules text) fall back to the identity line the description used to always be.
	const ogDescription = $derived(
		card.rawRulesText?.replace(/[{}]/g, '') ??
			`${card.name} — ${card.color} ${card.cardType}. ${card.printings.length} printings.`
	);
</script>

<Meta
	title="{card.name} — novastack"
	description={ogDescription}
	origin={data.origin}
	path="/cards/{card.slug}"
	image={cardImageUrl(data.printing.id, 733)}
/>

<article class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
	<nav class="mb-6 text-sm text-muted">
		<a href="/cards" class="underline decoration-dotted underline-offset-4 hover:text-neon"
			>← All cards</a
		>
	</nav>

	<div class="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
		<!-- Larger art at the 733w tier: the printed card readable at native resolution. -->
		<div>
			<CardImage
				printingId={printing.id}
				thumbhash={printing.thumbhash}
				color={card.color}
				alt="{card.name} — {set?.printed ?? printing.setId} {printing.collectorNumber}"
				sizes="(min-width: 1024px) 22rem, 100vw"
				eager
				class="rounded-xl shadow-2xl shadow-black/60"
			/>
			<p class="mt-2 text-center text-xs text-muted">
				Art by {printing.artist}
			</p>
		</div>

		<div class="min-w-0">
			<h1 class="text-3xl font-semibold tracking-tight text-bright uppercase">{nameParts[0]}</h1>
			{#if nameParts[1]}
				<p class="text-lg font-medium tracking-wide text-muted uppercase">{nameParts[1]}</p>
			{/if}

			<!-- Cost, Type, Classifications: shared with every other surface that shows a Card's
				metadata (`CardPane`, the deck view's preview panel) — see `CardMetaBadges`. -->
			<div class="mt-3">
				<CardMetaBadges {card} />
			</div>

			<CardStats {card} showCost={false} class="mt-4" />

			<!-- No separate keyword-pill list: every keyword here already appears inline in the
				rules text below (`RulesText`), styled and linked identically — a second list
				would just repeat it. -->
			<div class="mt-6 border-t border-edge/60 pt-4">
				<RulesText paragraphs={card.rulesText} />
				{#if card.flavorText !== null}
					<p class="mt-4 leading-relaxed text-muted italic">{card.flavorText}</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- The printings gallery: substantial rather than a chip row. -->
	<section class="mt-12">
		<h2 class="text-lg font-semibold text-bright">
			Printings
			<span class="ml-1 text-sm font-normal text-muted tabular-nums">
				{card.printings.length}{#if artists.length > 1}
					· {artists.length} artists{/if}
			</span>
		</h2>

		<ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each card.printings as entry, index (entry.id)}
				{@const entrySet = findSetIdentifier(entry.setId)}
				{@const current = entry.key === printing.key}
				<li>
					<button
						type="button"
						onclick={() => choose(entry.key)}
						aria-current={current ? 'true' : undefined}
						class="group w-full rounded-lg border border-edge/60 p-3 text-left transition-colors
							hover:border-muted"
						class:border-neon={current}
					>
						<CardImage
							printingId={entry.id}
							thumbhash={entry.thumbhash}
							color={card.color}
							alt="{card.name}, {entrySet?.printed ?? entry.setId} {entry.collectorNumber}"
							sizes="(min-width: 1280px) 15rem, (min-width: 640px) 20rem, 90vw"
							eager={index === 0}
							class="rounded-md"
						/>

						<dl class="mt-3 space-y-0.5 text-xs">
							<div class="flex justify-between gap-2">
								<dt class="text-muted">Set</dt>
								<dd class="text-right text-body">{entrySet?.name ?? entry.setId}</dd>
							</div>
							<div class="flex justify-between gap-2">
								<dt class="text-muted">Printed</dt>
								<dd class="font-mono text-body">{entrySet?.printed ?? '—'}</dd>
							</div>
							<div class="flex justify-between gap-2">
								<dt class="text-muted">Collector no.</dt>
								<dd class="font-mono text-body">{entry.collectorNumber}</dd>
							</div>
							<div class="flex justify-between gap-2">
								<dt class="text-muted">Rarity</dt>
								<dd class="text-right text-body">{entry.rarity}</dd>
							</div>
							<div class="flex justify-between gap-2">
								<dt class="text-muted">Artist</dt>
								<dd class="text-right text-body">{entry.artist}</dd>
							</div>
						</dl>
					</button>
				</li>
			{/each}
		</ul>
	</section>
</article>
