<script lang="ts">
	/**
	 * The Set facet, **grouped base vs derivative**.
	 *
	 * A flat list would present a 15-card demo deck as a peer of the game's only real release. The
	 * grouping is the point, not decoration.
	 *
	 * The facet is over the eight **printed** Set Identifiers, not the twelve sets the API
	 * reports. The API splits every set into retail and beta entries; that split is its own
	 * invention and does not exist on the cards, which carry the identical printed identifier and
	 * differ only by a `β` on the Collector Number.
	 *
	 * Set-Exclusive cards are surfaced because "show me the Base Set" legitimately excludes real
	 * cards, and that is worth saying out loud rather than leaving as an absence.
	 */
	import type { SetSummary } from '#lib/cards/schema.js';

	let {
		sets,
		selected,
		setExclusiveCount,
		onToggle
	}: {
		sets: readonly SetSummary[];
		selected: readonly string[];
		setExclusiveCount: number;
		onToggle: (setId: string) => void;
	} = $props();

	const groups = $derived([
		{ label: 'Base set', entries: sets.filter((set) => set.kind === 'base') },
		{ label: 'Derivative products', entries: sets.filter((set) => set.kind === 'derivative') }
	]);
</script>

<fieldset class="min-w-0">
	<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
		Sets
		{#if selected.length > 0}
			<span class="text-neon">({selected.length})</span>
		{/if}
	</legend>

	<div class="max-h-56 space-y-2 overflow-y-auto rounded-md border border-edge/50 p-2">
		{#each groups as group (group.label)}
			<div>
				<p class="mb-1 text-[0.65rem] tracking-widest text-muted/70 uppercase">{group.label}</p>
				<ul>
					{#each group.entries as set (set.id)}
						<li>
							<label
								class="flex cursor-pointer items-baseline gap-2 rounded px-1 py-1 text-sm
									hover:bg-raised/60"
							>
								<input
									type="checkbox"
									checked={selected.includes(set.id)}
									onchange={() => onToggle(set.id)}
									class="size-3.5 accent-neon"
								/>
								<span class="min-w-0 flex-1">
									<span class="block truncate">{set.name}</span>
									<span class="font-mono text-[0.7rem] text-muted">{set.printed}</span>
								</span>
								<span class="text-xs text-muted tabular-nums">{set.cardCount}</span>
							</label>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>

	{#if setExclusiveCount > 0}
		<p class="mt-1 text-[0.7rem] leading-snug text-muted/80">
			{setExclusiveCount} cards are Set-Exclusive — they exist only in derivative products, so the base
			set alone excludes them.
		</p>
	{/if}
</fieldset>
