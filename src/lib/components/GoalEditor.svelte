<script lang="ts">
	/**
	 * The Collecting Goal editor — which **Printing Runs** the viewer is collecting, and therefore
	 * what "Complete" means for them (`CONTEXT.md`).
	 *
	 * Grouped by Set, because that is how a collector thinks about it ("base set French, Heist
	 * retail"). Eight of the twelve Sets have exactly one Run, so they render as a single chip:
	 * presenting a treatment axis there would invent a decision the data doesn't offer.
	 *
	 * **A chip carries its treatment label only when its Set has more than one treatment.** Night
	 * City Brawl reads `EN 37`, not `retail · EN 37` — "retail" implies a beta run exists to be
	 * distinguished from, and for most Sets none does. Computed per Set from its own Runs, so it
	 * stays correct if a Set ever gains one.
	 *
	 * Writes are immediate and optimistic (the store rolls back on failure), because a chip is one
	 * deliberate click and a Save button would just be a second thing to forget.
	 */
	import { dataset } from '#lib/cards/index.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import { DEFAULT_GOAL, PRINTING_RUNS, type PrintingRun } from '#lib/collection/goal.js';

	const runsBySet = dataset.sets
		.map((set) => ({ set, runs: PRINTING_RUNS.filter((run) => run.setId === set.id) }))
		.filter((group) => group.runs.length > 0);

	const totalPrintings = PRINTING_RUNS.reduce((sum, run) => sum + run.printings, 0);

	const counted = $derived(
		PRINTING_RUNS.filter((run) => collection.goal.has(run.key)).reduce(
			(sum, run) => sum + run.printings,
			0
		)
	);

	function chipLabel(run: PrintingRun, runs: readonly PrintingRun[]): string {
		const treatments = new Set(runs.map((other) => other.treatment));
		const locale = run.locale.toUpperCase();
		return treatments.size > 1 ? `${run.treatment} · ${locale}` : locale;
	}

	/** Derives the next Goal rather than mutating a copy — `saveGoal` replaces wholesale, so
	 * building the replacement directly is both simpler and what the store actually wants. */
	function toggle(key: string) {
		const current = collection.goal;
		void collection.saveGoal(
			current.has(key)
				? new Set([...current].filter((other) => other !== key))
				: new Set([...current, key])
		);
	}

	/** Back to the default — a distinct outcome from ticking the same Runs by hand, since it means
	 * "I haven't chosen" and so follows the default if that ever changes. */
	function reset() {
		void collection.saveGoal(null);
	}

	function selectAll() {
		void collection.saveGoal(new Set(PRINTING_RUNS.map((run) => run.key)));
	}
</script>

<div class="max-w-3xl">
	<p class="text-sm text-muted">
		Pick the printing runs you're collecting. Anything else still shows up and can still be added —
		it just doesn't count toward completion.
	</p>

	<p class="mt-4 font-mono text-sm text-bright tabular-nums">
		{counted} of {totalPrintings} printings counted
		{#if collection.goalIsDefault}
			<span class="ml-2 rounded bg-surface px-2 py-0.5 text-xs text-muted">default</span>
		{/if}
	</p>

	<div class="mt-5 space-y-3">
		{#each runsBySet as group (group.set.id)}
			{@const chosen = group.runs.filter((run) => collection.goal.has(run.key)).length}
			<div class="rounded-lg border px-4 py-3 {chosen > 0 ? 'border-neon-dim/60' : 'border-edge'}">
				<div class="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<span class="text-sm {chosen > 0 ? 'text-bright' : 'text-muted'}">{group.set.name}</span>
					<span class="font-mono text-xs text-muted">{group.set.printed}</span>
				</div>

				<div class="flex flex-wrap gap-2">
					{#each group.runs as run (run.key)}
						{@const on = collection.goal.has(run.key)}
						<button
							type="button"
							aria-pressed={on}
							disabled={!collection.editable}
							onclick={() => toggle(run.key)}
							class="rounded-full border px-3.5 py-1.5 font-mono text-xs transition-colors
								disabled:opacity-40 {on
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
			type="button"
			disabled={!collection.editable || collection.goalIsDefault}
			onclick={reset}
			class="text-muted hover:text-neon disabled:opacity-40">Reset to default</button
		>
		<button
			type="button"
			disabled={!collection.editable}
			onclick={selectAll}
			class="text-muted hover:text-neon disabled:opacity-40">Everything</button
		>
		<button
			type="button"
			disabled={!collection.editable}
			onclick={() => collection.saveGoal(new Set(DEFAULT_GOAL))}
			class="text-muted hover:text-neon disabled:opacity-40">English retail only</button
		>
		{#if collection.saving}
			<span class="ml-auto text-muted">Saving…</span>
		{/if}
	</div>
</div>
