<script lang="ts">
	import PeriodFields from '#lib/components/tournaments/PeriodFields.svelte';
	import { periodParams } from '#lib/tournaments/period.js';
	// A Card's tournament record: its art and headline numbers, a picker for another card, and two views
	// of the same usage (every deck that ran it; where it fits). The picker is a plain GET form to
	// `/tournaments/cards`, which redirects, so it works without JavaScript.
	import { page } from '$app/state';
	import { dataset } from '#lib/cards/index.js';
	import Meta from '#lib/components/Meta.svelte';
	import LegendArt from '#lib/components/tournaments/LegendArt.svelte';
	import { cardName } from '#lib/tournaments/present.js';
	import { href } from '#lib/tournaments/url.js';

	let { data, children } = $props();
	const usage = $derived(data.usage);
	const base = $derived(`/tournaments/cards/${usage.slug}`);

	const choices = [...dataset.cards].sort((a, b) => a.name.localeCompare(b.name));
	const percent = (n: number) => `${Math.round(n * 100)}%`;

	const facts = $derived([
		['In decks', percent(usage.inclusion)],
		['Avg copies', usage.avgCopies.toFixed(1)],
		['Decks', `${usage.decks} / ${usage.totalDecks}`],
		['In sideboard', String(usage.inSide)],
		...(usage.asLegend > 0 ? [['As a Legend', String(usage.asLegend)]] : []),
		['Won an event', String(usage.winners)],
		['Top 8', String(usage.top8)]
	]);
	const views = $derived([
		{ path: base, label: 'Usage & finishes' },
		{ path: `${base}/fit`, label: 'Where it fits' }
	]);
</script>

<!-- `noindex` until the tournament pages launch. -->
<Meta
	title="{cardName(usage.slug)} in tournaments — novastack"
	description="How {cardName(usage.slug)} has done in Cyberpunk TCG tournaments."
	origin={data.origin}
	path={page.url.pathname}
	noindex
/>

<div>
	<div class="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-4">
			<h1 class="font-mono text-xl text-bright">Played in tournaments</h1>
			<form
				method="GET"
				action="/tournaments/cards"
				class="flex items-center gap-2 font-mono text-xs text-muted"
			>
				<PeriodFields period={data.period} />
				<label for="card-picker">Card</label>
				<select
					id="card-picker"
					name="card"
					class="max-w-64 rounded border border-edge bg-shell px-2 py-1.5 text-body"
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				>
					{#each choices as card (card.slug)}
						<option value={card.slug} selected={card.slug === usage.slug}>{card.name}</option>
					{/each}
				</select>
				<noscript><button class="rounded border border-edge px-2 py-1.5">Go</button></noscript>
			</form>
		</div>

		<div class="mt-6 grid gap-8 md:grid-cols-[14rem_1fr]">
			<div>
				<LegendArt slug={usage.slug} sizes="320px" class="w-full shadow-2xl" />
				<h2 class="mt-3 text-lg font-semibold text-bright">{cardName(usage.slug)}</h2>
				<dl class="mt-3 grid grid-cols-2 gap-2 text-sm">
					{#each facts as [label, value] (label)}
						<div class="rounded-lg border border-edge bg-shell p-2">
							<dt class="font-mono text-[10px] tracking-wide text-muted uppercase">{label}</dt>
							<dd class="font-mono text-base text-bright">{value}</dd>
						</div>
					{/each}
				</dl>
			</div>

			<div class="min-w-0">
				<nav class="mb-4 flex gap-1.5" aria-label="Card views">
					{#each views as view (view.path)}
						<a
							href={href(view.path, periodParams(data.period))}
							aria-current={page.url.pathname === view.path ? 'page' : undefined}
							class="rounded-full border px-3 py-1 font-mono text-xs {page.url.pathname ===
							view.path
								? 'border-neon bg-neon/10 text-bright'
								: 'border-edge text-muted hover:text-body'}"
						>
							{view.label}
						</a>
					{/each}
				</nav>
				{@render children()}
			</div>
		</div>
	</div>
</div>
