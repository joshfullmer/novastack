<script lang="ts">
	/**
	 * The Collecting Goal's own pane — a real route rather than a toggled view, so it is
	 * deep-linkable and behaves under Back like anything else.
	 *
	 * The editor itself is `#lib/components/GoalEditor.svelte`; this is just the heading and the
	 * page's metadata. The rail comes from `../+layout.svelte`.
	 */
	import GoalEditor from '#lib/components/GoalEditor.svelte';
	import Meta from '#lib/components/Meta.svelte';

	let { data } = $props();
</script>

<Meta
	title="Collecting goal — novastack"
	description="Choose which printing runs count toward a complete collection."
	origin={data.origin}
	path="/collection/goal"
/>

<div class="mb-6">
	<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Collecting goal</p>
	<h1 class="mt-1 text-4xl font-bold tracking-tight text-bright">What counts as complete</h1>
</div>

<GoalEditor />
