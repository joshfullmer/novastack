<script lang="ts">
	// The tournaments section's own navigation. Not in the site nav yet: the pages are unlaunched
	// (production has no tournament tables), so they are reachable by URL and from each other only.
	import { page } from '$app/state';

	let { children } = $props();

	const sections = [
		{
			href: '/tournaments',
			label: 'Events',
			active: (p: string) => p === '/tournaments' || /^\/tournaments\/\d/.test(p)
		},
		{
			href: '/tournaments/meta',
			label: 'Meta',
			active: (p: string) => p.startsWith('/tournaments/meta')
		},
		{
			href: '/tournaments/decks',
			label: 'Decks',
			active: (p: string) => p.startsWith('/tournaments/decks')
		},
		{
			href: '/tournaments/cards',
			label: 'Cards',
			active: (p: string) => p.startsWith('/tournaments/cards')
		}
	];
</script>

<div>
	<div class="mx-auto w-full max-w-6xl px-4 pt-6">
		<nav class="flex gap-5 border-b border-edge font-mono text-sm" aria-label="Tournaments">
			{#each sections as section (section.href)}
				<a
					href={section.href}
					aria-current={section.active(page.url.pathname) ? 'page' : undefined}
					class="-mb-px border-b-2 pb-2 {section.active(page.url.pathname)
						? 'border-neon text-bright'
						: 'border-transparent text-muted hover:text-body'}"
				>
					{section.label}
				</a>
			{/each}
		</nav>
	</div>
</div>

{@render children()}
