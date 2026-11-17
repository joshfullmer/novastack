<script lang="ts">
	import { page } from '$app/state';
	import Meta from '#lib/components/Meta.svelte';

	let { data, children } = $props();
</script>

<!-- `noindex` until the tournament pages launch. -->
<Meta
	title="Tournament decks — novastack"
	description="Decklists from Cyberpunk TCG tournaments."
	origin={data.origin}
	path={page.url.pathname}
	noindex
/>

<div
	class="py-6 {page.data.fullHeight === true
		? '2xl:flex 2xl:min-h-0 2xl:flex-1 2xl:flex-col 2xl:pb-4'
		: ''}"
>
	{@render children()}
</div>
