<script lang="ts">
	/**
	 * Three Legend color slots, each cycling none → the four Colors → none.
	 *
	 * **Colors alone determine the budget**, because every Legend provides the same RAM of its
	 * own color — asserted at ingest, not assumed. So `Red/Red/Blue` means Red 4, Blue 2, and the
	 * control is three clicks rather than three Legend pickers. An illegal budget is unreachable
	 * rather than merely rejected.
	 *
	 * The cycle follows the *derived* Color order rather than a second hardcoded list, so there is
	 * one source of truth for what order the colors come in.
	 *
	 * **Slot positions are local; the URL is still canonical.** The budget depends only on how many
	 * of each color are chosen, so `red,blue` and `blue,red` are the same filter and must not be
	 * two URLs — the serialised form is sorted. But sorting is a *presentation* disaster if it
	 * reaches the control: changing slot 1 would visibly reshuffle slots 2 and 3 under the cursor.
	 *
	 * So `positions` records the arrangement the reader last built, and `slots` reconciles it
	 * against the URL: a position keeps its color while that color is still in the budget, and
	 * anything left over fills the gaps. That makes the URL authoritative — back/forward and shared
	 * links still work — without letting canonicalisation move things around mid-click.
	 */
	import type { ColorBudget } from '#lib/filters/budget.js';
	import type { Color } from '#lib/cards/vocabulary.js';
	import { COLOR_DOT } from '../color.js';

	let {
		colorOrder,
		legendColors,
		budget,
		onChange
	}: {
		colorOrder: readonly Color[];
		legendColors: readonly Color[];
		budget: ColorBudget;
		onChange: (next: Color[]) => void;
	} = $props();

	const SLOT_COUNT = 3;

	let positions = $state<(Color | null)[]>(Array.from({ length: SLOT_COUNT }, () => null));

	const slots = $derived.by(() => {
		const remaining = [...legendColors];

		const kept: (Color | null)[] = positions.map((color) => {
			if (color === null) return null;
			const at = remaining.indexOf(color);
			if (at === -1) return null;
			remaining.splice(at, 1);
			return color;
		});

		// Anything the URL carries that no position claimed — a shared link, or a Back — lands in
		// the first free slots.
		for (let slot = 0; slot < kept.length && remaining.length > 0; slot += 1) {
			if (kept[slot] === null) kept[slot] = remaining.shift() ?? null;
		}

		return kept;
	});

	/** none → first color → … → last color → none. */
	function next(current: Color | null): Color | null {
		if (current === null) return colorOrder[0] ?? null;
		return colorOrder[colorOrder.indexOf(current) + 1] ?? null;
	}

	function cycle(slot: number) {
		const updated = [...slots];
		updated[slot] = next(slots[slot]);
		positions = updated;
		onChange(updated.filter((color): color is Color => color !== null));
	}

	const active = $derived(colorOrder.filter((color) => budget[color] > 0));
</script>

<fieldset class="min-w-0">
	<legend class="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
		Legend colors
	</legend>

	<div class="flex items-center gap-2">
		{#each slots as color, slot (slot)}
			<button
				type="button"
				onclick={() => cycle(slot)}
				aria-label="Legend slot {slot + 1}: {color ?? 'empty'}. Activate to change color."
				class="flex size-8 items-center justify-center rounded-md border border-edge
					transition-colors hover:border-muted"
			>
				{#if color === null}
					<span class="text-xs text-muted" aria-hidden="true">+</span>
				{:else}
					<span class="size-4 rounded-full {COLOR_DOT[color]}" aria-hidden="true"></span>
				{/if}
			</button>
		{/each}

		{#if active.length > 0}
			<p class="ml-1 text-xs text-muted tabular-nums">
				{active.map((color) => `${color} ${budget[color]}`).join(' · ')}
			</p>
		{:else}
			<p class="ml-1 text-xs text-muted/70">RAM budget off</p>
		{/if}
	</div>
</fieldset>
