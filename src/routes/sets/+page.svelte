<script lang="ts">
	/**
	 * The Sets hierarchy overview — `.scratch/sets-page/map.md`.
	 *
	 * Adapts swudb.com's own Sets page (`.scratch/sets-page/research/swudb-sets-page.md`): one
	 * block per Main Set — logo, heading, counts, a nested table of the products hanging from
	 * it — newest first. Sets that span several Main Sets have no parent to hang from, so they
	 * get a Misc table below the blocks, rendered only when there is one. No release dates: no
	 * source data for them, same reasoning `sets.ts` already applies to `cycle`; an Announced
	 * Main Set carries a curated season and a link instead, because that is all anyone has said.
	 *
	 * A shipped Main Set's name is huge on purpose: it is the one thing in its block that must not
	 * be mistaken for a peer of the derivative sets below it — which stay a plain table, matching
	 * swudb's own choice and scanning faster than tiles for a same-shaped list of rows. An
	 * Announced one is deliberately smaller and dashed: it has no cards, so it must not outweigh
	 * the set people can actually play.
	 */
	import { dataset } from '#lib/cards/index.js';
	import { isAnnounced } from '#lib/cards/dataset.js';
	import { MAIN_SET_LOGOS } from '#lib/assets/set-logos.js';
	import Meta from '#lib/components/Meta.svelte';
	import type { SetSummary } from '#lib/cards/schema.js';

	let { data } = $props();

	const mainSets = dataset.allSets
		.filter((set) => set.kind === 'main')
		.toSorted((a, b) => b.category.localeCompare(a.category, undefined, { numeric: true }));
	const miscSets = dataset.sets.filter((set) => set.kind === 'misc');

	const derivativesOf = (main: SetSummary) =>
		dataset.sets.filter((set) => set.kind === 'derivative' && set.parentId === main.id);

	// The share card is the newest Main Set that has actually shipped.
	const shippedLogo = MAIN_SET_LOGOS[mainSets.find((set) => !isAnnounced(set))?.id ?? ''];
</script>

{#snippet setTable(sets: readonly SetSummary[])}
	<table class="w-full text-left text-base">
		<thead>
			<tr class="border-b border-edge/60 text-muted">
				<th class="pb-3 font-medium">Set</th>
				<th class="pb-3 text-right font-medium">Cards</th>
				<th class="pb-3 text-right font-medium">Printings</th>
			</tr>
		</thead>
		<tbody>
			{#each sets as set (set.id)}
				<tr class="border-b border-edge/30 last:border-0">
					<td class="py-4">
						<a href="/sets/{set.id}" class="text-body hover:text-neon">{set.name}</a>
						<span class="ml-2 font-mono text-sm text-muted">{set.printed}</span>
					</td>
					<td class="py-4 text-right text-muted tabular-nums">{set.cardCount}</td>
					<td class="py-4 text-right text-muted tabular-nums">{set.printingCount}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<Meta
	title="Sets — novastack"
	description="Every set in the Cyberpunk TCG, and how they relate."
	origin={data.origin}
	path="/sets"
	image={shippedLogo}
/>

<div class="mx-auto max-w-[1800px] space-y-10 p-6 sm:p-10">
	<h1 class="text-3xl font-semibold text-bright">Sets</h1>

	{#each mainSets as main (main.id)}
		{@const logo = MAIN_SET_LOGOS[main.id]}
		{#if isAnnounced(main)}
			<section class="rounded-xl border border-dashed border-edge bg-shell/60 p-6 sm:p-8">
				<div class="flex flex-col gap-6 sm:flex-row sm:items-center">
					<img
						src={logo}
						alt="{main.name} logo"
						class="size-28 shrink-0 object-contain sm:size-36"
					/>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium tracking-widest text-neon-dim uppercase">
							Main set · Announced
						</p>
						<a
							href="/sets/{main.id}"
							class="mt-2 block text-4xl leading-none font-bold tracking-tight text-bright
								hover:text-neon sm:text-5xl">{main.name}</a
						>
						<div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-lg text-muted">
							<span class="font-mono">{main.printed}</span>
							{#if main.releaseWindow}<span>{main.releaseWindow}</span>{/if}
							{#if main.announcement}
								<a
									href={main.announcement}
									rel="external noopener"
									class="text-neon hover:text-neon-dim">Read the announcement →</a
								>
							{/if}
						</div>
					</div>
				</div>
			</section>
		{:else}
			{@const derivatives = derivativesOf(main)}
			<section class="rounded-xl border border-edge bg-shell p-8 sm:p-12">
				<div class="flex flex-col gap-8 lg:flex-row lg:items-center">
					<img src={logo} alt="{main.name} logo" class="w-40 shrink-0 object-contain sm:w-56" />

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium tracking-widest text-neon-dim uppercase">Main set</p>
						<a
							href="/sets/{main.id}"
							class="mt-2 block text-6xl leading-none font-bold tracking-tight text-bright
								hover:text-neon sm:text-7xl">{main.name}</a
						>
						<div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-lg text-muted">
							<span class="font-mono">{main.printed}</span>
							<span class="tabular-nums"
								>{main.cardCount} cards · {main.printingCount} printings</span
							>
							<a href="/cards?q=set:{main.id}" class="text-neon hover:text-neon-dim"
								>Browse in Cards →</a
							>
						</div>
					</div>
				</div>

				{#if derivatives.length > 0}
					<p class="mt-12 mb-4 text-xs font-medium tracking-widest text-muted/60 uppercase">
						Derivative sets
					</p>
					{@render setTable(derivatives)}
				{/if}
			</section>
		{/if}
	{/each}

	{#if miscSets.length > 0}
		<section class="rounded-xl border border-edge bg-shell p-8 sm:p-12">
			<p class="mb-1 text-sm font-medium tracking-widest text-neon-dim uppercase">Misc</p>
			<p class="mb-6 text-muted">Sets with cards from more than one main set.</p>
			{@render setTable(miscSets)}
		</section>
	{/if}
</div>
