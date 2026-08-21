<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import Attribution from '#lib/components/Attribution.svelte';
	import Nav from '#lib/components/Nav.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!--
	The dataset is deliberately **not** imported here. Vite code-splits per route, so an import in
	the shared layout would make `/` download all 133 cards to render a search box. `/cards` and
	`/cards/[slug]` import it themselves.
-->
<div class="flex min-h-screen flex-col">
	<Nav />
	<main class="flex-1">{@render children()}</main>
	<Attribution />
</div>
