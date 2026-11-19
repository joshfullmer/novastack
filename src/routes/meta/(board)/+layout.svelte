<script lang="ts">
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';

	let { data, children } = $props();
</script>

<!-- `noindex` until the tournament pages launch. -->
<Meta
	title="Meta — novastack"
	description="What is being played in Cyberpunk TCG tournaments, and how it is doing."
	origin={data.origin}
	path={page.url.pathname}
	noindex
/>

<div class="py-6">
	{@render children()}
</div>
