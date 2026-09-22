<script lang="ts">
	/**
	 * A set's detail page — `.scratch/sets-page/map.md`.
	 *
	 * Metadata header + a checklist grid, one tile per Printing in the set (`printingsInSet`,
	 * `derive.ts`) — not `evaluate`'s "one Match per Card", which is right for the `/cards`
	 * browsing grid but would squash a retail/beta pair or a tournament-prize variant down to
	 * one tile here, disagreeing with the header's own printing count. A "Browse in Cards →"
	 * link is the escape hatch into full filtering/sorting for anyone who wants that view
	 * instead. A derivative set's header points back up to the Base Set it supplements, so the
	 * hierarchy reads in both directions, not just top-down from the overview.
	 *
	 * **Sorted by Collector Number, ascending** — not the shared `Sort` pipeline's `default`
	 * (colour/type/cost). `card-database.md` deliberately left `Set → Collector Number`
	 * unreachable as a *general* sort option (§4.5's note), but scoped to one already-fixed set
	 * this is exactly the natural order a set's own checklist is printed in, so it's a local sort
	 * here rather than an extension to the shared `Sort` type — `collectorNumberSortKey`
	 * (`derive.ts`) is what reads through the `β` prefix and letter suffixes.
	 *
	 * **Retail/Beta tabs, Locale tabs, and a "one per card" toggle** — in `?treatment=`,
	 * `?locale=`, `?unique=`. Beta is a Kickstarter-only phenomenon of Set 1's sets, and it's
	 * detected from the data (any `β` Collector Number present), not hardcoded to those sets by
	 * id — a set that never had a beta run just never shows the tabs. Locale tabs follow the
	 * same rule: a set with no localized reprint never shows them, and the tab list itself is
	 * whichever locales the set's own printings carry, not a hardcoded pair. All three params
	 * use the same shallow-navigation pattern the card detail page's `?printing=` chooser
	 * already uses (`currentUrl()`, `goto(..., { shallow: true })`), so a link to "the Beta
	 * checklist", "the FR checklist" or "the collapsed view" is shareable.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { currentUrl } from '#lib/filters/shallow.js';
	import { dataset } from '#lib/cards/index.js';
	import {
		collapseToUniqueCards,
		collectorNumberSortKey,
		printTreatment,
		printingsInSet,
		type PrintTreatment
	} from '#lib/cards/derive.js';
	import CardTile from '#lib/components/CardTile.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import wncLogo from '#lib/assets/wnc-logo.png';
	import { cardImageUrl } from '#lib/cards/schema.js';
	import { DEFAULT_LOCALE, type Locale } from '#lib/cards/vocabulary.js';

	const TREATMENT_PARAM = 'treatment';
	const LOCALE_PARAM = 'locale';
	const UNIQUE_PARAM = 'unique';

	let { data } = $props();

	const set = $derived(dataset.sets.find((candidate) => candidate.id === page.params.id));
	const baseSet = dataset.sets.find((candidate) => candidate.kind === 'base');

	function byCollectorNumber(
		a: { printing: { collectorNumber: string } },
		b: { printing: { collectorNumber: string } }
	): number {
		const [aNum, aText] = collectorNumberSortKey(a.printing.collectorNumber);
		const [bNum, bText] = collectorNumberSortKey(b.printing.collectorNumber);
		return aNum - bNum || aText.localeCompare(bText);
	}

	const allResults = $derived(
		set === undefined ? [] : printingsInSet(dataset.cards, set.id).sort(byCollectorNumber)
	);

	const hasBothTreatments = $derived(
		new Set(allResults.map((match) => printTreatment(match.printing))).size === 2
	);

	const activeTreatment = $derived<PrintTreatment>(
		currentUrl().searchParams.get(TREATMENT_PARAM) === 'beta' ? 'beta' : 'retail'
	);

	const treatmentFiltered = $derived(
		hasBothTreatments
			? allResults.filter((match) => printTreatment(match.printing) === activeTreatment)
			: allResults
	);

	// Order: `DEFAULT_LOCALE` first, so its tab reads as "the" checklist and the others as
	// variants of it — same convention as retail sitting before beta.
	const localesPresent = $derived(
		[...new Set(allResults.map((match) => match.printing.locale))].sort((a, b) =>
			a === DEFAULT_LOCALE ? -1 : b === DEFAULT_LOCALE ? 1 : a.localeCompare(b)
		)
	);
	const hasMultipleLocales = $derived(localesPresent.length > 1);

	const activeLocale = $derived<Locale>(
		localesPresent.find((locale) => locale === currentUrl().searchParams.get(LOCALE_PARAM)) ??
			DEFAULT_LOCALE
	);

	const localeFiltered = $derived(
		hasMultipleLocales
			? treatmentFiltered.filter((match) => match.printing.locale === activeLocale)
			: treatmentFiltered
	);

	// Only worth showing the control where it would do something — a set (or a
	// treatment/locale combination within one) with no duplicate cards has nothing to collapse.
	const canCollapse = $derived(
		localeFiltered.length > new Set(localeFiltered.map((match) => match.card.slug)).size
	);
	const collapsed = $derived(canCollapse && currentUrl().searchParams.has(UNIQUE_PARAM));

	const results = $derived(collapsed ? collapseToUniqueCards(localeFiltered) : localeFiltered);
	const shownCardCount = $derived(new Set(results.map((match) => match.card.slug)).size);

	function chooseTreatment(treatment: PrintTreatment) {
		const next = new URL(currentUrl().href);
		// Retail is the absent state, matching the printing chooser's "Default Printing is the
		// absent state" convention — one canonical URL for the common case.
		if (treatment === 'retail') next.searchParams.delete(TREATMENT_PARAM);
		else next.searchParams.set(TREATMENT_PARAM, treatment);
		void goto(next, { shallow: true, replace: true });
	}

	function chooseLocale(locale: Locale) {
		const next = new URL(currentUrl().href);
		// `DEFAULT_LOCALE` is the absent state, matching the treatment/printing choosers'
		// "the common case has one canonical URL" convention.
		if (locale === DEFAULT_LOCALE) next.searchParams.delete(LOCALE_PARAM);
		else next.searchParams.set(LOCALE_PARAM, locale);
		void goto(next, { shallow: true, replace: true });
	}

	function toggleCollapsed() {
		const next = new URL(currentUrl().href);
		if (collapsed) next.searchParams.delete(UNIQUE_PARAM);
		else next.searchParams.set(UNIQUE_PARAM, '1');
		void goto(next, { shallow: true, replace: true });
	}

	// The Base Set has its own logo; a derivative set has no comparable asset, so its first
	// card (Collector-Number order, same as the grid below) stands in instead.
	const ogImage = $derived(
		set?.kind === 'base'
			? wncLogo
			: results[0]
				? cardImageUrl(results[0].printing.id, 733)
				: undefined
	);
</script>

<Meta
	title="{set?.name ?? 'Set not found'} — novastack"
	description={set
		? `${set.name} — ${set.cardCount} cards, ${set.printingCount} printings.`
		: 'This set could not be found.'}
	origin={data.origin}
	path="/sets/{page.params.id}"
	image={ogImage}
/>

<div class="mx-auto max-w-[1800px] p-6 sm:p-10">
	<a href="/sets" class="text-base text-muted hover:text-neon">← All sets</a>

	{#if set === undefined}
		<p class="mt-6 text-muted">No set matches "{page.params.id}".</p>
	{:else}
		<div class="mt-4 mb-10">
			<p class="text-sm font-medium tracking-widest text-neon-dim uppercase">
				{set.kind === 'base' ? 'Base set' : 'Derivative set'}
			</p>
			<h1 class="mt-2 text-5xl font-bold tracking-tight text-bright">{set.name}</h1>
			<div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-lg text-muted">
				<span class="font-mono">{set.printed}</span>
				<span class="tabular-nums">{shownCardCount} cards · {results.length} printings</span>
				{#if set.kind === 'derivative' && baseSet}
					<span>
						Supplements
						<a href="/sets/{baseSet.id}" class="text-neon hover:text-neon-dim">{baseSet.name}</a>
					</span>
				{/if}
				<a href="/cards?q=set:{set.id}" class="text-neon hover:text-neon-dim">Browse in Cards →</a>
			</div>

			{#if hasBothTreatments || hasMultipleLocales || canCollapse}
				<div class="mt-5 flex flex-wrap items-center gap-4">
					{#if hasBothTreatments}
						<div class="inline-flex overflow-hidden rounded-md border border-edge text-sm">
							{#each ['retail', 'beta'] as const as treatment (treatment)}
								<button
									type="button"
									aria-pressed={activeTreatment === treatment}
									onclick={() => chooseTreatment(treatment)}
									class="px-3 py-1 capitalize transition-colors {activeTreatment === treatment
										? 'bg-neon text-void'
										: 'text-body hover:bg-raised'}">{treatment}</button
								>
							{/each}
						</div>
					{/if}

					{#if hasMultipleLocales}
						<div class="inline-flex overflow-hidden rounded-md border border-edge text-sm">
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

					{#if canCollapse}
						<button
							type="button"
							aria-pressed={collapsed}
							onclick={toggleCollapsed}
							class="rounded-full border px-3 py-1 text-sm transition-colors {collapsed
								? 'border-neon bg-neon text-void'
								: 'border-edge text-body hover:border-muted'}"
						>
							Hide duplicates
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6">
			{#each results as match, index (collapsed ? match.card.slug : match.printing.id)}
				<li>
					<CardTile
						card={match.card}
						printing={match.printing}
						sizes="200px"
						eager={index < 6}
						onSelect={() => false}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</div>
