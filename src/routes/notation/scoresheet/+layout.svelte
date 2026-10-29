<script lang="ts">
	/**
	 * The scoresheet section: one page title and one set of writing rules over two sheets — a
	 * single match for a notepad (the default), or four matches to a full page. They are the same notation on the same
	 * paper, so they share their lead and sit one click apart; each stays a route of its own, which
	 * keeps it prerendered, linkable and printable without any client state.
	 *
	 * Hidden in print, with the rest of the page: only the sheet reaches the paper.
	 */
	import { page } from '$app/state';
	import PageHeader from '#lib/components/notation/PageHeader.svelte';

	let { children } = $props();

	const SHEETS = [
		{ href: '/notation/scoresheet', label: 'Notepad' },
		{ href: '/notation/scoresheet/full-page', label: 'Full page' }
	] as const;

	/** `/notation/scoresheet` is a prefix of the full page's path, so it must match exactly. */
	const isCurrent = (href: string) => page.url.pathname.replace(/\/$/, '') === href;
</script>

<PageHeader title="Scoresheet" class="print:hidden">
	Turn numbers are printed — write only the moves, one turn per row. Write
	<code class="font-mono text-neon">..</code> for a pass; a blank row is an error, never a pass.
	Circle <em>first</em> and <em>result</em> yourself.
</PageHeader>

<nav aria-label="Scoresheet formats" class="-mt-4 print:hidden">
	<ul class="flex gap-1 rounded-lg bg-surface p-1 text-sm sm:inline-flex">
		{#each SHEETS as sheet (sheet.href)}
			<li class="flex-1 sm:flex-none">
				<a
					href={sheet.href}
					aria-current={isCurrent(sheet.href) ? 'page' : undefined}
					class="block rounded-md px-4 py-1.5 text-center whitespace-nowrap transition-colors {isCurrent(
						sheet.href
					)
						? 'bg-edge/60 text-bright'
						: 'text-muted hover:text-bright'}">{sheet.label}</a
				>
			</li>
		{/each}
	</ul>
</nav>

{@render children()}
