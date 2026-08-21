<script lang="ts">
	import './layout.css';
	import Attribution from '#lib/components/Attribution.svelte';
	import Nav from '#lib/components/Nav.svelte';

	let { children } = $props();
</script>

<!-- A static file rather than an import: Vite inlines small SVGs as base64, which would ship
     the whole mark in every page's HTML instead of fetching it once. -->
<svelte:head><link rel="icon" href="/favicon.svg" /></svelte:head>

<!--
	The dataset is deliberately **not** imported here. Vite code-splits per route, so an import in
	the shared layout would make `/` download all 133 cards to render a search box. `/cards` and
	`/cards/[slug]` import it themselves.
-->
<div class="flex min-h-screen flex-col">
	<Nav />
	<main class="flex flex-1 flex-col">{@render children()}</main>
	<Attribution />
</div>
