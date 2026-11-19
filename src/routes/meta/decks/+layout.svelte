<script lang="ts">
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';
	import { META_INDEXED } from '#lib/meta/launch.js';

	let { data, children } = $props();
</script>

<!-- `noindex` until Meta is public (`META_INDEXED`). -->
<Meta
	title="Meta decks — novastack"
	description="Decklists from Cyberpunk TCG tournaments."
	origin={data.origin}
	path={page.url.pathname}
	noindex={!META_INDEXED}
/>

<div
	class="py-6 {page.data.fullHeight === true
		? '2xl:flex 2xl:min-h-0 2xl:flex-1 2xl:flex-col 2xl:pb-4'
		: ''}"
>
	{@render children()}
</div>
