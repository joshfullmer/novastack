<script lang="ts">
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';
	import { META_INDEXED } from '#lib/meta/launch.js';

	let { data, children } = $props();
</script>

<!-- `noindex` until Meta is public (`META_INDEXED`). -->
<Meta
	title="Meta — novastack"
	description="What is being played in Cyberpunk TCG tournaments, and how it is doing."
	origin={data.origin}
	path={page.url.pathname}
	noindex={!META_INDEXED}
/>

<div class="py-6">
	{@render children()}
</div>
