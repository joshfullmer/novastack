<script lang="ts">
	/**
	 * The Notation section's frame: one navigation bar over four pages, and one content column for all
	 * of them. Width, padding and the gap under each page's header are set here and nowhere else — the
	 * pages used to carry their own, and two of them had quietly become wider than the others.
	 */
	import SectionNav from '#lib/components/notation/SectionNav.svelte';

	let { children } = $props();
</script>

<SectionNav />
<div class="notation-frame mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6">
	{@render children()}
</div>
