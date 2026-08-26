<script lang="ts">
	/**
	 * A set's detail page — `.scratch/sets-page/map.md`.
	 *
	 * Metadata header + the existing card grid, pre-filtered to this set via the same `set`
	 * predicate the query language compiles `set:` into — no bespoke browsing UI, no FilterBar:
	 * a "Browse in Cards →" link is the escape hatch into full filtering/sorting for anyone who
	 * wants it. A derivative set's header points back up to the Base Set it supplements, so the
	 * hierarchy reads in both directions, not just top-down from the overview.
	 *
	 * **Sorted by Collector Number, ascending** — not the shared `Sort` pipeline's `default`
	 * (colour/type/cost). `card-database.md` deliberately left `Set → Collector Number`
	 * unreachable as a *general* sort option (§4.5's note), but scoped to one already-fixed set
	 * this is exactly the natural order a set's own checklist is printed in, so it's a local sort
	 * here rather than an extension to the shared `Sort` type. A Collector Number is a string
	 * (`CONTEXT.md`: `β` prefix, letter suffixes like `005a`), so this pulls the leading digits
	 * out to compare numerically and falls back to the full string for ties.
	 */
	import { page } from '$app/state';
	import { dataset } from '#lib/cards/index.js';
	import { evaluate, type Match } from '#lib/filters/predicate.js';
	import CardTile from '#lib/components/CardTile.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import wncLogo from '#lib/assets/wnc-logo.png';
	import { cardImageUrl } from '#lib/cards/schema.js';

	let { data } = $props();

	const set = $derived(dataset.sets.find((candidate) => candidate.id === page.params.id));
	const baseSet = dataset.sets.find((candidate) => candidate.kind === 'base');

	function collectorNumberValue(collectorNumber: string): number {
		return Number(/\d+/.exec(collectorNumber)?.[0] ?? 0);
	}

	function byCollectorNumber(a: Match, b: Match): number {
		return (
			collectorNumberValue(a.printing.collectorNumber) -
				collectorNumberValue(b.printing.collectorNumber) ||
			a.printing.collectorNumber.localeCompare(b.printing.collectorNumber)
		);
	}

	const results = $derived(
		set === undefined
			? []
			: evaluate(dataset, { kind: 'set', values: [set.id] }).sort(byCollectorNumber)
	);

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
				<span class="tabular-nums">{set.cardCount} cards · {set.printingCount} printings</span>
				{#if set.kind === 'derivative' && baseSet}
					<span>
						Supplements
						<a href="/sets/{baseSet.id}" class="text-neon hover:text-neon-dim">{baseSet.name}</a>
					</span>
				{/if}
				<a href="/cards?q=set:{set.id}" class="text-neon hover:text-neon-dim">Browse in Cards →</a>
			</div>
		</div>

		<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6">
			{#each results as match, index (match.card.slug)}
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
