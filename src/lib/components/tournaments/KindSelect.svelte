<script lang="ts">
	// The kind of event as a dropdown. Choosing one navigates straight to `href(kind)`, which the caller
	// builds from the page's own URL so every other filter is kept. A kind with a count shows it, so
	// the choice says what it would leave.
	import { goto } from '$app/navigation';
	import { EVENT_KINDS, type EventKind } from '#lib/tournaments/kind.js';

	let {
		kinds,
		value,
		href
	}: {
		kinds: { kind: EventKind; count?: number }[];
		/** The chosen kind; null for all of them. */
		value: EventKind | null;
		href: (kind: EventKind | null) => string;
	} = $props();

	function choose(picked: string) {
		void goto(href(EVENT_KINDS.find((kind) => kind === picked) ?? null));
	}
</script>

<label class="flex items-center gap-1.5 font-mono text-xs text-muted">
	Kind
	<select
		value={value ?? ''}
		onchange={(event) => choose(event.currentTarget.value)}
		class="rounded border border-edge bg-shell px-2 py-1 text-body"
	>
		<option value="">All kinds</option>
		{#each kinds as { kind, count } (kind)}
			<option value={kind}>{kind}{count === undefined ? '' : ` (${count})`}</option>
		{/each}
	</select>
</label>
