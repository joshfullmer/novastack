<script lang="ts">
	// The tournaments section: a collapsible sidebar (navigation, and what the statistics are cut by) and
	// the page beside it. Not in the site nav yet: the pages are unlaunched (production has no tournament
	// tables), so they are reachable by URL and from each other only. Narrower than `lg` the sidebar is a
	// menu above the page instead.
	import { page } from '$app/state';
	import TournamentsNav from '#lib/components/tournaments/TournamentsNav.svelte';
	import { cookieState } from '#lib/cookie-state.svelte.js';

	let { data, children } = $props();

	// svelte-ignore state_referenced_locally
	const nav = cookieState('tournaments-nav', data.navState);
	const collapsed = $derived(nav.value === 'collapsed');
	const toggle = () => (nav.value = collapsed ? 'open' : 'collapsed');
	// A page that fits the screen needs every box above it to hand down the height it has.
	const full = $derived(page.data.fullHeight === true);
</script>

<!-- The extra plain wrapper matters: `<main>` (root layout) is a column flex container, and a
     `mx-auto max-w-…` box that is a *direct* flex child has its stretch behaviour disabled. -->
<div class={full ? '2xl:flex 2xl:min-h-0 2xl:flex-1 2xl:flex-col' : ''}>
	<div
		class="mx-auto flex w-full max-w-[1800px] gap-6 px-4 sm:px-6 {full
			? '2xl:min-h-0 2xl:flex-1'
			: ''}"
	>
		<aside
			class="hidden shrink-0 pt-6 lg:sticky lg:top-nav lg:block lg:self-start {collapsed
				? 'w-10'
				: 'w-48'}"
		>
			<TournamentsNav
				period={data.period}
				periods={data.periods}
				kinds={data.kinds}
				{collapsed}
				ontoggle={toggle}
			/>
		</aside>
		<div class="min-w-0 flex-1 {full ? '2xl:flex 2xl:min-h-0 2xl:flex-col' : ''}">
			<details class="pt-4 lg:hidden">
				<summary class="cursor-pointer font-mono text-sm text-muted">Tournaments ▾</summary>
				<div class="mt-3 rounded-lg border border-edge bg-shell p-3">
					<TournamentsNav period={data.period} periods={data.periods} kinds={data.kinds} />
				</div>
			</details>
			{@render children()}
		</div>
	</div>
</div>
