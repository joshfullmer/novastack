<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import Attribution from '#lib/components/Attribution.svelte';
	import EmailVerificationBanner from '#lib/components/EmailVerificationBanner.svelte';
	import Nav from '#lib/components/Nav.svelte';

	let { children } = $props();

	// A page can ask to fit the screen (`fullHeight` in its load data): on a wide one the window then
	// does not scroll, the footer steps aside, and the page's own panes scroll instead. Wide only: below
	// that such a page is an ordinary one.
	const full = $derived(page.data.fullHeight === true);
</script>

<!-- A static file rather than an import: Vite inlines small SVGs as base64, which would ship
     the whole mark in every page's HTML instead of fetching it once. -->
<svelte:head>
	<link rel="icon" href="/favicon.svg" />
	<!-- Site-wide and identical on every page — unlike the rest of the Open Graph tags
	     (`#lib/components/Meta.svelte`), which vary per route and so live there instead. -->
	<meta property="og:site_name" content="novastack" />
	<!-- The `--color-neon` accent, as a hex Discord's embed-border renderer is guaranteed to
	     parse — computed via `oklch(78% 0.17 195)` → sRGB, not eyeballed. -->
	<meta name="theme-color" content="#00d7d9" />
</svelte:head>

<!--
	The dataset is deliberately **not** imported here. Vite code-splits per route, so an import in
	the shared layout would make `/` download all 133 cards to render a search box. `/cards` and
	`/cards/[slug]` import it themselves.
-->
<div class="flex min-h-screen flex-col {full ? '2xl:h-dvh 2xl:min-h-0 2xl:overflow-hidden' : ''}">
	<Nav />
	<EmailVerificationBanner />
	<main class="flex flex-1 flex-col {full ? '2xl:min-h-0' : ''}">{@render children()}</main>
	<div class={full ? 'contents 2xl:hidden' : 'contents'}><Attribution /></div>
</div>
