<script lang="ts">
	/**
	 * PROTOTYPE — throwaway. The Collecting Goal editor: which **Printing Runs** you're collecting,
	 * and therefore what "Complete" means to you.
	 *
	 * Grouped by Set, because that's how a collector thinks about it ("I want base-set French and
	 * Heist retail"). The eight Sets with only one Run render as a single chip — there is nothing to
	 * choose there, so presenting a treatment axis would invent a decision.
	 *
	 * `alwaysOpen` drops the disclosure, for hosts that give the editor a pane of its own.
	 */
	import {
		completion,
		goal,
		goalSlots,
		runsBySet,
		slots,
		toggleRun
	} from './fake-collection.svelte.js';

	let { alwaysOpen = false }: { alwaysOpen?: boolean } = $props();

	let toggled = $state(false);
	const shown = $derived(alwaysOpen || toggled);

	const progress = $derived(completion());

	/**
	 * The treatment half of a chip's label is only meaningful when the Set actually has both
	 * treatments. Night City Brawl has one Run, so `EN 37` says everything — `retail · EN 37`
	 * would imply a beta run exists to distinguish it from.
	 */
	function chipLabel(
		run: { treatment: string; locale: string },
		runs: readonly { treatment: string }[]
	): string {
		const treatments = new Set(runs.map((other) => other.treatment));
		const locale = run.locale.toUpperCase();
		return treatments.size > 1 ? `${run.treatment} · ${locale}` : locale;
	}
</script>

<div class="rounded-xl border border-edge bg-shell">
	{#if !alwaysOpen}
		<button
			onclick={() => (toggled = !toggled)}
			class="flex w-full items-center gap-3 px-5 py-4 text-left"
		>
			<span class="text-sm font-medium text-bright">Collecting goal</span>
			<span class="font-mono text-xs text-muted tabular-nums">
				{goalSlots().length} of {slots.length} printings counted
			</span>
			<span class="ml-auto text-muted">{shown ? '−' : '+'}</span>
		</button>
	{/if}

	{#if shown}
		<div class="px-5 py-5" class:border-t={!alwaysOpen} class:border-edge={!alwaysOpen}>
			<p class="mb-5 text-sm text-muted">
				Pick the printing runs you're collecting. Anything else still shows up and can still be
				added — it just doesn't count toward completion.
			</p>

			<div class="space-y-3">
				{#each runsBySet as group (group.set.id)}
					{@const chosen = group.runs.filter((run) => goal.has(run.key)).length}
					<div
						class="rounded-lg border px-4 py-3 {chosen > 0 ? 'border-neon-dim/60' : 'border-edge'}"
					>
						<div class="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span class="text-sm {chosen > 0 ? 'text-bright' : 'text-muted'}"
								>{group.set.name}</span
							>
							<span class="font-mono text-xs text-muted">{group.set.printed}</span>
						</div>

						<div class="flex flex-wrap gap-2">
							{#each group.runs as run (run.key)}
								<button
									onclick={() => toggleRun(run.key)}
									class="rounded-full border px-3.5 py-1.5 font-mono text-xs {goal.has(run.key)
										? 'border-neon bg-neon/10 text-neon'
										: 'border-edge text-muted hover:border-neon-dim hover:text-body'}"
								>
									{chipLabel(run, group.runs)}
									<span class="ml-1.5 tabular-nums opacity-70">{run.printings}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-5 flex flex-wrap items-center gap-4 border-t border-edge pt-4 text-xs">
				<button
					onclick={() => {
						for (const group of runsBySet)
							for (const run of group.runs)
								if (run.treatment === 'retail' && run.locale === 'en') goal.add(run.key);
								else goal.delete(run.key);
					}}
					class="text-muted hover:text-neon">English retail only</button
				>
				<button
					onclick={() => {
						for (const group of runsBySet) for (const run of group.runs) goal.add(run.key);
					}}
					class="text-muted hover:text-neon">Everything</button
				>
				<button
					onclick={() => {
						for (const group of runsBySet) for (const run of group.runs) goal.delete(run.key);
					}}
					class="text-muted hover:text-neon">Clear</button
				>
				<span class="ml-auto font-mono text-sm text-bright tabular-nums">
					{progress.owned}/{progress.total} · {progress.percent}% complete
				</span>
			</div>
		</div>
	{/if}
</div>
