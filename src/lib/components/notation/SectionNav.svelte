<script lang="ts">
	/**
	 * The Notation section's own navigation: four pages, always one click apart, from any of them.
	 *
	 * Each page used to point at the others in its own prose, which worked until it did not — nothing
	 * said the section had four pages, or which one you were on. This says both. It lives in the
	 * section's layout (`routes/notation/+layout.svelte`) so it cannot be forgotten on a new page.
	 * Hidden in print, so the scoresheet is only the sheet.
	 *
	 * Labels are what a person comes to *do*, not what the page is: the front door is "Learn", because
	 * that is its job. The section's name leads the row (from `sm` up; on a phone the four tabs need
	 * the width) and appears nowhere else on a page.
	 */
	import { page } from '$app/state';

	const PAGES = [
		{ href: '/notation', label: 'Learn' },
		{ href: '/notation/reference', label: 'Reference' },
		{ href: '/notation/scoresheet', label: 'Scoresheet' },
		{ href: '/notation/check', label: 'Check a game' }
	] as const;

	/**
	 * `/notation` is a prefix of every other page in the section, so it must match exactly. The
	 * others also own what is beneath them: the scoresheet's notepad is still the Scoresheet.
	 */
	const isCurrent = (href: string) => {
		const path = page.url.pathname.replace(/\/$/, '');
		return href === '/notation' ? path === href : path === href || path.startsWith(`${href}/`);
	};
</script>

<nav aria-label="Notation sections" class="border-b border-edge/60 print:hidden">
	<div class="mx-auto flex max-w-5xl items-center gap-5 px-4 sm:gap-7 sm:px-6">
		<span class="hidden font-mono text-xs tracking-widest text-neon-dim uppercase sm:inline"
			>Nova Notation</span
		>
		<ul class="-mb-px flex items-center gap-5 overflow-x-auto text-sm sm:gap-7">
			{#each PAGES as item (item.href)}
				<li class="shrink-0">
					<a
						href={item.href}
						aria-current={isCurrent(item.href) ? 'page' : undefined}
						class="block border-b-2 py-2.5 transition-colors {isCurrent(item.href)
							? 'border-neon text-bright'
							: 'border-transparent text-muted hover:text-bright'}">{item.label}</a
					>
				</li>
			{/each}
		</ul>
	</div>
</nav>
