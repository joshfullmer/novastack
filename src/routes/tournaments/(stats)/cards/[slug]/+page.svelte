<script lang="ts">
	import { periodParams } from '#lib/tournaments/period.js';
	// Usage & finishes: the decks that ran this Card, best finish first, up to ENTRY_LIMIT of them.
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { formatDate, legendNames } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data } = $props();
	const entries = $derived(data.usage.entries);
	const legends = (line: string | null) => (line ? line.split('+') : []);
</script>

<div
	class="grid grid-cols-[3.5rem_1fr_1fr_5.5rem] gap-x-3 px-2 font-mono text-[11px] tracking-wide text-muted uppercase"
	aria-hidden="true"
>
	<span>Finish</span><span>Deck</span><span>Event</span><span class="text-right">Copies</span>
</div>
<ul class="mt-1 space-y-0.5">
	{#each entries as entry (entry.guid)}
		<li>
			<a
				href={href(`/tournaments/decks/${entry.guid}`, periodParams(data.period))}
				class="grid grid-cols-[3.5rem_1fr_1fr_5.5rem] items-center gap-x-3 rounded-lg px-2 py-2 odd:bg-shell/60 hover:bg-surface"
			>
				<span class="font-mono text-sm {entry.rank === 1 ? 'text-neon' : 'text-muted'}">
					{entry.rank}<span class="text-[10px]">/{entry.playerCount}</span>
				</span>
				<span class="flex min-w-0 items-center gap-2">
					<span class="flex shrink-0 -space-x-2">
						{#each legends(entry.line) as slug (slug)}
							<LegendArt {slug} sizes="40px" class="w-6 ring-1 ring-void" />
						{/each}
					</span>
					<span class="min-w-0">
						<span class="block truncate text-sm text-bright">{entry.player}</span>
						<span class="block truncate text-[11px] text-muted"
							>{legendNames(legends(entry.line))}</span
						>
					</span>
				</span>
				<span class="min-w-0">
					<span class="block truncate text-xs">{entry.eventName}</span>
					<span class="font-mono text-[11px] text-muted">{formatDate(entry.startsAt)}</span>
				</span>
				<span class="text-right font-mono text-sm">
					{#if entry.asLegend}Legend{:else}{entry.main}{#if entry.side}<span class="text-muted">
								+{entry.side} sb</span
							>{/if}{/if}
				</span>
			</a>
		</li>
	{:else}
		<li class="p-6 text-center text-sm text-muted">No deck in this period ran it.</li>
	{/each}
</ul>
{#if data.usage.decks > entries.length}
	<p class="mt-3 text-xs text-muted">
		The {entries.length} best finishes of the {data.usage.decks} decks that ran it.
	</p>
{/if}
