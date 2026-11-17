<script lang="ts">
	// What every statistics page is cut by, above it: a period (hidden until a `metas` row exists), the
	// kind of event (hidden until more than one kind has been ingested), and a floor on field size.
	// All three live in the URL, so a link carries them (`periodParams`).
	import { page } from '$app/state';
	import LinkSelect from '#lib/components/tournaments/LinkSelect.svelte';
	import { FIELD_FLOORS } from '#lib/tournaments/period.js';
	import { withParams } from '#lib/tournaments/url.js';

	let { data, children } = $props();

	/** This page's URL with one choice swapped, and the page number dropped (it belongs to the old list). */
	const linkTo = (patch: Record<string, string | number | null>) =>
		withParams(page.url, patch, ['page']);

	const periods = $derived(
		data.periods.map((p) => ({
			value: p.id === null ? 'all' : String(p.id),
			label: p.name,
			href: linkTo({ period: p.param })
		}))
	);
	const kinds = $derived([
		{ value: '', label: 'All kinds', href: linkTo({ kind: null }) },
		...data.kinds.map((kind) => ({ value: kind, label: kind, href: linkTo({ kind }) }))
	]);
	const sizes = $derived([
		{ value: '', label: 'Any', href: linkTo({ min: null }) },
		...FIELD_FLOORS.map((floor) => ({
			value: String(floor),
			label: `${floor}+`,
			href: linkTo({ min: floor })
		}))
	]);
</script>

<div>
	<div
		class="mx-auto flex w-full max-w-[1800px] flex-wrap justify-end gap-x-6 gap-y-2 px-4 pt-4 font-mono text-xs sm:px-6"
	>
		{#if data.periods.length > 1}
			<LinkSelect
				label="Period"
				value={data.period.id === null ? 'all' : String(data.period.id)}
				options={periods}
			/>
		{/if}
		{#if data.kinds.length > 1 || data.period.kind !== null}
			<LinkSelect label="Kind" value={data.period.kind ?? ''} options={kinds} />
		{/if}
		<LinkSelect label="Players" value={String(data.period.minPlayers ?? '')} options={sizes} />
	</div>
</div>

{@render children()}
