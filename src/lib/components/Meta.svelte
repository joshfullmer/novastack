<!--
	Per-page `<title>` + description + canonical link + Open Graph/Twitter Card tags, in one place
	so every route gets the same shape rather than hand-rolling these tags each time.

	`og:url`/`og:image` need **absolute** URLs — Discord (and every other link-preview crawler)
	never resolves a relative one, since it has no notion of "the current page" the way a browser
	does. Callers pass `origin` (from the root layout's `data`, itself `ORIGIN` from
	`src/env.ts`) plus a relative `path`/`image`; the absolute-URL building, and skipping those
	two tags entirely if `origin` is unavailable (allowed during a local build with no secrets
	configured — see `src/env.ts`) rather than emitting a broken `undefined`-laced URL, both
	happen here once instead of on every page. Site-wide tags that never vary per page
	(`og:site_name`, `theme-color`) live in the root layout instead — repeating them here would
	risk them drifting apart.

	Discord does not execute JavaScript — it only reads the server-rendered HTML — so these tags
	must come from a real `load` (server or prerendered), never be added after the fact from
	`onMount` or an effect.
-->
<script lang="ts">
	let {
		title,
		description,
		origin,
		path,
		image
	}: {
		title: string;
		description: string;
		origin: string | undefined;
		path: string;
		image?: string;
	} = $props();

	const url = $derived(origin ? `${origin}${path}` : undefined);
	const imageUrl = $derived(origin && image ? `${origin}${image}` : undefined);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	{#if url}
		<link rel="canonical" href={url} />
	{/if}

	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	{#if url}
		<meta property="og:url" content={url} />
	{/if}
	{#if imageUrl}
		<meta property="og:image" content={imageUrl} />
	{/if}

	<meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if imageUrl}
		<meta name="twitter:image" content={imageUrl} />
	{/if}
</svelte:head>
