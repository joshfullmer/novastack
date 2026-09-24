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
	 * **A Locale toggle, exclusive rather than a disclosure** — same `?locale=` shallow-nav
	 * pattern as the Set detail page's tabs, chosen over an inline "+N localized" reveal because
	 * it's the more familiar convention (Scryfall). It defaults to whichever locale the deep-linked
	 * printing carries, not always `DEFAULT_LOCALE`: a shared link to a French printing should land
	 * on a gallery that shows it, not one that's filtered it out. Only appears when the card
	 * actually has a localized printing.
	 *
	 * Back-navigation needs no work: filters live in query params, so history returns the reader to
	 * the narrowed grid.
	 */
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { currentUrl } from '#lib/filters/shallow.js';
	import CardImage from '#lib/components/CardImage.svelte';
	import QuantityStepper from '#lib/components/QuantityStepper.svelte';
	import { collection } from '#lib/collection/state.svelte.js';
	import { manageCollection } from '#lib/collection/manage-pref.svelte.js';
	import CardMetaBadges from '#lib/components/CardMetaBadges.svelte';
	import CardStats from '#lib/components/CardStats.svelte';
	import FaqText from '#lib/components/FaqText.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import RulesText from '#lib/components/RulesText.svelte';
	import { splitCardName } from '#lib/cards/derive.js';
	import { cardImageUrl, PRINTING_PARAM } from '#lib/cards/schema.js';
	import { findSetIdentifier } from '#lib/cards/sets.js';
	import { DEFAULT_LOCALE, type Locale } from '#lib/cards/vocabulary.js';

	const LOCALE_PARAM = 'locale';

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
	// Client-side, not in `load`: this page is edge-cached with `s-maxage`, so per-user data in
	// the response would be served to every visitor. Gated on the toggle so turning the controls
	// off also stops the request. See `routes/api/collection/+server.ts`.
	$effect(() => {
		if (manageCollection.enabled) void collection.load();
	});

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

	// `DEFAULT_LOCALE` first, same convention as the Set detail page's tabs.
	const localesPresent = $derived(
		[...new Set(card.printings.map((entry) => entry.locale))].sort((a, b) =>
			a === DEFAULT_LOCALE ? -1 : b === DEFAULT_LOCALE ? 1 : a.localeCompare(b)
		)
	);
	const hasMultipleLocales = $derived(localesPresent.length > 1);

	// Falls back to the deep-linked printing's own locale, not always `DEFAULT_LOCALE` — see the
	// header comment.
	const activeLocale = $derived<Locale>(
		localesPresent.find((locale) => locale === currentUrl().searchParams.get(LOCALE_PARAM)) ??
			printing.locale
	);

	// Always explicit, unlike `choose()` above — the absent state here defaults to the
	// deep-linked printing's own locale, not always `DEFAULT_LOCALE`, so deleting the param on a
	// choice of `DEFAULT_LOCALE` wouldn't select it back when viewing a non-default printing; it
	// would just fall through to `activeLocale`'s `printing.locale` fallback again.
	function chooseLocale(locale: Locale) {
		const next = new URL(currentUrl().href);
		next.searchParams.set(LOCALE_PARAM, locale);
		void goto(next, { shallow: true, replace: true });
	}

	const visiblePrintings = $derived(
		hasMultipleLocales
			? card.printings.filter((entry) => entry.locale === activeLocale)
			: card.printings
	);

	const artists = $derived([...new Set(visiblePrintings.map((entry) => entry.artist))]);

	const nameParts = $derived(splitCardName(card));

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
			<h1 class="text-3xl font-semibold tracking-tight text-bright uppercase">{nameParts.name}</h1>
			{#if nameParts.subtitle}
				<p class="text-lg font-medium tracking-wide text-muted uppercase">{nameParts.subtitle}</p>
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
				{visiblePrintings.length}{#if artists.length > 1}
					· {artists.length} artists{/if}
			</span>
		</h2>

		{#if hasMultipleLocales}
			<div class="mt-3 inline-flex overflow-hidden rounded-md border border-edge text-sm">
				{#each localesPresent as locale (locale)}
					<button
						type="button"
						aria-pressed={activeLocale === locale}
						onclick={() => chooseLocale(locale)}
						class="px-3 py-1 uppercase transition-colors {activeLocale === locale
							? 'bg-neon text-void'
							: 'text-body hover:bg-raised'}">{locale}</button
					>
				{/each}
			</div>
		{/if}

		<ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each visiblePrintings as entry, index (entry.id)}
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
							{#if entry.locale !== DEFAULT_LOCALE}
								<div class="flex justify-between gap-2">
									<dt class="text-muted">Locale</dt>
									<dd class="text-right font-mono text-body uppercase">{entry.locale}</dd>
								</div>
							{/if}
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
					{#if manageCollection.enabled && collection.status !== 'idle' && collection.status !== 'loading'}
						<!-- Outside the chooser `<button>` on purpose: a stepper nested in a button is
						     invalid markup, and its clicks would also select the printing. -->
						<div data-collection-ui class="mt-2 flex items-center gap-2">
							<span class="text-xs text-muted">In collection</span>
							<QuantityStepper
								printingId={entry.id}
								label="{card.name} {entry.collectorNumber}"
								expanded
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<!-- 11 of 151 cards have no ruling yet — no section rather than an empty one. -->
	{#if card.faqs.length > 0}
		<section class="mt-12">
			<h2 class="text-lg font-semibold text-bright">FAQ</h2>
			<dl class="mt-4 space-y-5">
				{#each card.faqs as faq (faq.id)}
					<div>
						<dt class="font-medium text-body">
							<FaqText text={faq.question} />
						</dt>
						<dd class="mt-1 text-muted">
							<FaqText text={faq.answer} />
						</dd>
					</div>
				{/each}
			</dl>
			<p class="mt-4 text-sm text-muted">
				Rules questions? See <a href="/faq" class="text-neon hover:text-neon-dim"
					>General Rulings →</a
				>
			</p>
		</section>
	{/if}
</article>
