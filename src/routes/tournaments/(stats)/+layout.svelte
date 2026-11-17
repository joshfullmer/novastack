<script lang="ts">
	// The period selector, above every statistics page. Hidden until a `metas` row exists: with only
	// "All time" to choose there is nothing to select.
	import { page } from '$app/state';
	import { withParams } from '#lib/tournaments/url.js';

	let { data, children } = $props();

	/** This page's URL with the period swapped, and the page number dropped (it belongs to the old list). */
	const linkTo = (id: number | null) => withParams(page.url, { period: id }, ['page']);
</script>

{#if data.periods.length > 1}
	<div>
		<div class="mx-auto flex w-full max-w-6xl justify-end px-4 pt-4">
			<nav class="flex flex-wrap items-center gap-1 font-mono text-xs" aria-label="Period">
				<span class="mr-1 text-muted">Period</span>
				{#each data.periods as p (p.id)}
					<a
						href={linkTo(p.id)}
						aria-current={p.id === data.period.id ? 'true' : undefined}
						class="rounded-full border px-3 py-1 {p.id === data.period.id
							? 'border-neon bg-neon/10 text-bright'
							: 'border-edge text-muted hover:text-body'}"
					>
						{p.name}
					</a>
				{/each}
			</nav>
		</div>
	</div>
{/if}

{@render children()}
