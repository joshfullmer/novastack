<script lang="ts">
	/**
	 * The Sets hierarchy overview — `.scratch/sets-page/map.md`.
	 *
	 * Adapts swudb.com's own Sets page (`.scratch/sets-page/research/swudb-sets-page.md`): one
	 * "Core Set" block — logo, heading, counts, a nested table of the products tied to it —
	 * collapsed to a single group here, since novastack has exactly one Base Set and no
	 * standalone/ungrouped sets. No release dates: no source data for them, same reasoning
	 * `sets.ts` already applies to `cycle`. Counts come from the already-computed `SetSummary`.
	 *
	 * The Base Set's name is huge on purpose: it is the one thing on this page that must not be
	 * mistaken for a peer of the derivative sets below it — which stay a plain table, matching
	 * swudb's own choice and scanning faster than tiles for a same-shaped list of rows.
	 */
	import { dataset } from '#lib/cards/index.js';
	import wncLogo from '#lib/assets/wnc-logo.png';

	const baseSet = dataset.sets.find((set) => set.kind === 'base');
	const derivativeSets = dataset.sets.filter((set) => set.kind === 'derivative');
</script>

<svelte:head>
	<title>Sets — novastack</title>
	<meta name="description" content="Every set in the Cyberpunk TCG, and how they relate." />
</svelte:head>

<div class="mx-auto max-w-[1800px] p-6 sm:p-10">
	<h1 class="mb-10 text-3xl font-semibold text-bright">Sets</h1>

	{#if baseSet}
		<section class="rounded-xl border border-edge bg-shell p-8 sm:p-12">
			<div class="flex flex-col gap-8 lg:flex-row lg:items-center">
				<img src={wncLogo} alt="{baseSet.name} logo" class="w-40 shrink-0 object-contain sm:w-56" />

				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium tracking-widest text-neon-dim uppercase">Base set</p>
					<a
						href="/sets/{baseSet.id}"
						class="mt-2 block text-6xl leading-none font-bold tracking-tight text-bright
							hover:text-neon sm:text-7xl">{baseSet.name}</a
					>
					<div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-lg text-muted">
						<span class="font-mono">{baseSet.printed}</span>
						<span class="tabular-nums"
							>{baseSet.cardCount} cards · {baseSet.printingCount} printings</span
						>
						<a href="/cards?q=set:{baseSet.id}" class="text-neon hover:text-neon-dim"
							>Browse in Cards →</a
						>
					</div>
				</div>
			</div>

			<p class="mt-12 mb-4 text-xs font-medium tracking-widest text-muted/60 uppercase">
				Derivative sets
			</p>
			<table class="w-full text-left text-base">
				<thead>
					<tr class="border-b border-edge/60 text-muted">
						<th class="pb-3 font-medium">Set</th>
						<th class="pb-3 text-right font-medium">Cards</th>
						<th class="pb-3 text-right font-medium">Printings</th>
					</tr>
				</thead>
				<tbody>
					{#each derivativeSets as set (set.id)}
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
		</section>
	{/if}
</div>
