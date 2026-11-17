<script lang="ts">
	// The hidden inputs that make a GET form carry the period and its narrowing, as a link does with
	// `periodParams`: without them, searching a card would quietly drop back to all events.
	import { periodParams, type Period } from '#lib/tournaments/period.js';

	let { period }: { period: Period } = $props();
</script>

{#each Object.entries(periodParams(period)) as [name, value] (name)}
	{#if value !== null}<input type="hidden" {name} {value} />{/if}
{/each}
