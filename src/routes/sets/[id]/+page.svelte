<script lang="ts">
	/**
	 * A set's detail page — `.scratch/sets-page/map.md`.
	 *
	 * Metadata header + a checklist grid, one tile per Printing in the set (`printingsInSet`,
	 * `derive.ts`) — not `evaluate`'s "one Match per Card", which is right for the `/cards`
	 * browsing grid but would squash a retail/beta pair or a tournament-prize variant down to
	 * one tile here, disagreeing with the header's own printing count. A "Browse in Cards →"
	 * link is the escape hatch into full filtering/sorting for anyone who wants that view
	 * instead. A derivative set's header points back up to the Main Set it supplements, so the
	 * hierarchy reads in both directions, not just top-down from the overview.
	 *
	 * An Announced Main Set has no printings, so it gets the same header with a season and a
	 * link to the announcement in place of the counts, and an empty state in place of the grid.
	 * It resolves through `allSets`: it is not in `dataset.sets`, which is what every other
	 * surface sees.
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
	import QuantityStepper from '#lib/components/QuantityStepper.svelte';
	import { collection } from '#lib/collection/state.svelte.js';
	import { manageCollection } from '#lib/collection/manage-pref.svelte.js';
	import { MAIN_SET_LOGOS } from '#lib/assets/set-logos.js';
	import { isAnnounced } from '#lib/cards/dataset.js';
	import { cardImageUrl } from '#lib/cards/schema.js';
	import { DEFAULT_LOCALE, type Locale } from '#lib/cards/vocabulary.js';

	const TREATMENT_PARAM = 'treatment';
	const LOCALE_PARAM = 'locale';
	const UNIQUE_PARAM = 'unique';

	let { data } = $props();

	const set = $derived(dataset.allSets.find((candidate) => candidate.id === page.params.id));
	const announced = $derived(set !== undefined && isAnnounced(set));
	const parent = $derived(
		set?.parentId == null ? undefined : dataset.allSets.find((entry) => entry.id === set.parentId)
	);
	const logo = $derived(set === undefined ? undefined : MAIN_SET_LOGOS[set.id]);
	const KIND_LABELS = { main: 'Main set', derivative: 'Derivative set', misc: 'Misc set' } as const;

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

	// Client-side, not in `load`: this page is edge-cached with `s-maxage`, so per-user data in
	// the response would be served to every visitor. See `routes/api/collection/+server.ts`.
	// Gated on the toggle, so turning the controls off also stops the request rather than just
	// hiding what it fetched.
	$effect(() => {
		if (manageCollection.enabled) void collection.load();
	});

	/** How much of the *currently shown* checklist is owned — so it tracks the treatment, locale
	 * and collapse tabs rather than reporting against the whole set regardless of the view. */
	const ownedHere = $derived(results.filter((match) => collection.has(match.printing.id)).length);

	/** "Add all missing at 1x" — one bulk write rather than a request per card. */
	function addAllMissing() {
		const missing = new Map(
			results
				.filter((match) => !collection.has(match.printing.id))
				.map((match) => [match.printing.id, 1] as const)
		);
		void collection.setMany(missing);
	}

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

	// A Main Set has its own logo; any other set has no comparable asset, so its first card
	// (Collector-Number order, same as the grid below) stands in instead.
	const ogImage = $derived(
		logo ?? (results[0] ? cardImageUrl(results[0].printing.id, 733) : undefined)
	);
</script>

<Meta
	title="{set?.name ?? 'Set not found'} — novastack"
	description={set === undefined
		? 'This set could not be found.'
		: announced
			? `${set.name} — announced${set.releaseWindow ? `, ${set.releaseWindow}` : ''}. No cards revealed yet.`
			: `${set.name} — ${set.cardCount} cards, ${set.printingCount} printings.`}
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
			<div class="flex flex-col gap-6 {logo ? 'sm:flex-row sm:items-center' : ''}">
				{#if announced && logo}
					<img
						src={logo}
						alt="{set.name} logo"
						class="size-32 shrink-0 object-contain sm:size-40"
					/>
				{/if}
				<div class="min-w-0">
					<p class="text-sm font-medium tracking-widest text-neon-dim uppercase">
						{KIND_LABELS[set.kind]}{announced ? ' · Announced' : ''}
					</p>
					<h1 class="mt-2 text-5xl font-bold tracking-tight text-bright">{set.name}</h1>
					<div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-lg text-muted">
						<span class="font-mono">{set.printed}</span>
						{#if announced}
							{#if set.releaseWindow}<span>{set.releaseWindow}</span>{/if}
							{#if set.announcement}
								<a
									href={set.announcement}
									rel="external noopener"
									class="text-neon hover:text-neon-dim">Read the announcement →</a
								>
							{/if}
						{:else}
							<span class="tabular-nums">{shownCardCount} cards · {results.length} printings</span>
							{#if collection.editable && manageCollection.enabled}
								<span data-collection-ui class="text-neon tabular-nums"
									>{ownedHere}/{results.length} collected</span
								>
							{/if}
							{#if set.kind === 'derivative' && parent}
								<span>
									Supplements
									<a href="/sets/{parent.id}" class="text-neon hover:text-neon-dim">{parent.name}</a
									>
								</span>
							{/if}
							<a href="/cards?q=set:{set.id}" class="text-neon hover:text-neon-dim"
								>Browse in Cards →</a
							>
						{/if}
					</div>
				</div>
			</div>

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

				{#if collection.editable && manageCollection.enabled && ownedHere < results.length}
					<button
						data-collection-ui
						type="button"
						onclick={addAllMissing}
						class="rounded-full border border-edge px-3 py-1 text-sm text-body transition-colors
								hover:border-neon-dim hover:text-neon"
					>
						Add all missing (1×)
					</button>
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
		</div>

		{#if announced}
			<p class="max-w-prose text-lg text-muted">
				No cards revealed yet. Previews and spoilers are planned for the months ahead — the
				announcement has the details.
			</p>
		{/if}

		<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6">
			{#each results as match, index (collapsed ? match.card.slug : match.printing.id)}
				<li class="group/tile relative">
					<CardTile
						card={match.card}
						printing={match.printing}
						sizes="200px"
						eager={index < 6}
						onSelect={() => false}
					/>
					{#if manageCollection.enabled && collection.status !== 'idle' && collection.status !== 'loading'}
						<div data-collection-ui class="pointer-events-none absolute bottom-1 left-1">
							<QuantityStepper printingId={match.printing.id} label={match.card.name} />
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
