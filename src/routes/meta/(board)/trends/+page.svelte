<script lang="ts">
	// Trends: the meta over time, a line per deck. The y axis is either its share of the field or its match
	// win rate. Events cluster on weekends, so the unit is a week (a day is the same events' Saturday
	// and Sunday, and the gap between them is not a trend), and only
	// weeks with a real field behind them are drawn (`buildTrend`). One still running is drawn dashed and
	// faded, since its numbers may still move.
	//
	// A RAM's line is drawn in that RAM's colours, the same ones its letters wear, as a gradient: YYR holds
	// yellow, then blends to red, in the proportion it has them. YYR and YYB share a dominant colour but end
	// in different ones, so they still tell apart. Grouped by Legends there is no RAM to wear, so those lines
	// are one plain colour each and are named in it.
	import { page } from '$app/state';
	import Pills from '#lib/components/tournaments/Pills.svelte';
	import RamCode from '#lib/components/tournaments/RamCode.svelte';
	import { legendNames, RAM_PER_LEGEND } from '#lib/tournaments/present.js';
	import { ramParts, ramShorthand } from '#lib/tournaments/ram.js';
	import type { Color } from '#lib/cards/vocabulary.js';
	import { buildTrend, MIN_FIELD, MIN_MATCHES, type Point } from '#lib/tournaments/trend.js';
	import { withParams } from '#lib/tournaments/url.js';

	let { data } = $props();

	const trend = $derived(buildTrend(data.rows, data.now));
	const metric = $derived(data.metric);

	/** The game's colours, as the site paints them. */
	const CARD: Record<Color, string> = {
		Red: 'var(--color-card-red)',
		Yellow: 'var(--color-card-yellow)',
		Green: 'var(--color-card-green)',
		Blue: 'var(--color-card-blue)'
	};
	/** For Legends lines, which have no RAM colours: distinct hues at one lightness, so none outweighs another. */
	const PALETTE = [
		'oklch(76% 0.15 195)',
		'oklch(74% 0.17 27)',
		'oklch(82% 0.15 105)',
		'oklch(72% 0.15 150)',
		'oklch(72% 0.15 300)',
		'oklch(76% 0.14 60)'
	];

	/** A line's colour stops, first colour first; one stop is a plain line. */
	type Stop = { color: string; at: number };
	function stopsOf(key: string, i: number): Stop[] {
		if (data.by !== 'ram') return [{ color: PALETTE[i % PALETTE.length], at: 0 }];
		const parts = ramParts(key);
		const total = parts.reduce((n, part) => n + part.amount, 0);
		// Each colour is at its purest in the middle of its share of the RAM, and blends between.
		let before = 0;
		return parts.map((part) => {
			const at = (before + part.amount / 2) / total;
			before += part.amount;
			return { color: CARD[part.colour], at };
		});
	}
	const stops = $derived(trend.series.map((s, i) => stopsOf(s.key, i)));
	/** What to paint line `i` with in a given drawing: its gradient there, or its one colour. */
	const paint = (where: string, i: number) =>
		stops[i].length > 1 ? `url(#${where}-${i})` : stops[i][0].color;
	/** A RAM's letters, each in its colour, as `RamCode` shows them. */
	function lettersOf(key: string) {
		const short = ramShorthand(key, RAM_PER_LEGEND) !== null;
		return ramParts(key).flatMap(({ colour, amount }) =>
			Array.from({ length: short ? amount / RAM_PER_LEGEND : amount }, () => ({
				letter: short ? colour[0] : colour[0].toLowerCase(),
				color: CARD[colour]
			}))
		);
	}
	const name = (key: string) => legendNames(key.split('+'));

	let focus = $state<string | null>(null);

	const W = 880;
	const H = 380;
	const pad = { l: 44, r: 56, t: 12, b: 32 };

	const valueOf = (p: Point) => (metric === 'share' ? p.share : p.winRate);
	const known = $derived(
		trend.series.flatMap((s) => s.points.map(valueOf)).filter((v): v is number => v !== null)
	);
	const lo = $derived(
		metric === 'share' ? 0 : Math.max(0, Math.floor((Math.min(...known, 0.5) - 0.03) * 20) / 20)
	);
	const hi = $derived(
		Math.ceil((Math.max(...known, metric === 'share' ? 0.05 : 0.5) + 0.02) * 20) / 20
	);
	const x = (t: number) => {
		const [a, b] = [trend.times[0], trend.times.at(-1) ?? trend.times[0]];
		return pad.l + ((t - a) / (b - a)) * (W - pad.l - pad.r);
	};
	const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
	const ticks = $derived(Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4));
	/**
	 * Each line named where it ends, since two lines in a RAM's colours can be mirror images (YYR runs
	 * yellow to red, RRY red to yellow): the colour is never the only carrier. Pushed apart where lines end
	 * close together, so labels stay legible. Only for RAMs; a Legends line's name is far too long.
	 */
	const ends = $derived.by(() => {
		if (data.by !== 'ram') return [];
		const labels = trend.series.flatMap((s, i) => {
			const v = s.points.at(-1) ? valueOf(s.points.at(-1)!) : null;
			return v === null ? [] : [{ i, key: s.key, y: y(v) }];
		});
		labels.sort((a, b) => a.y - b.y);
		for (let k = 1; k < labels.length; k++)
			labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 14);
		return labels;
	});
	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const when = (t: number) =>
		new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

	/** A week still running: its numbers may still move, so it is drawn dashed and hollow. */
	const unsettled = (p: Point) => p.partial;

	/**
	 * A line as two paths: the segments between settled points, and the rest. A segment is settled only if
	 * both its ends are; one with no value at an end (nothing played) is not drawn.
	 */
	function segments(points: Point[]) {
		let solid = '';
		let dashed = '';
		for (let k = 1; k < points.length; k++) {
			const [a, b] = [points[k - 1], points[k]];
			const [va, vb] = [valueOf(a), valueOf(b)];
			if (va === null || vb === null) continue;
			const d = `M${x(a.t).toFixed(1)},${y(va).toFixed(1)}L${x(b.t).toFixed(1)},${y(vb).toFixed(1)}`;
			if (unsettled(a) || unsettled(b)) dashed += d;
			else solid += d;
		}
		return { solid, dashed };
	}
</script>

<!-- A gradient per line, laid along `x1`–`x2` of the drawing it is for (userSpaceOnUse, since a flat line has
     no height for the default box to take a gradient across). -->
{#snippet gradients(where: string, x1: number, x2: number)}
	<defs>
		{#each stops as list, i (i)}
			{#if list.length > 1}
				<linearGradient id="{where}-{i}" gradientUnits="userSpaceOnUse" {x1} {x2} y1="0" y2="0">
					{#each list as stop (stop.color)}
						<stop offset="{stop.at * 100}%" stop-color={stop.color} />
					{/each}
				</linearGradient>
			{/if}
		{/each}
	</defs>
{/snippet}

<header class="flex flex-wrap items-end justify-between gap-3 border-b border-edge pb-4">
	<div>
		<h1 class="sr-only">Trends</h1>
		<p class="font-mono text-xs text-muted">
			{trend.times.length}
			{trend.times.length === 1 ? 'week' : 'weeks'} · with at least {MIN_FIELD} decks each · a week starts
			on Monday
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<Pills
			label="Show"
			options={[
				['share', 'Share of field'],
				['winrate', 'Win rate']
			]}
			value={metric}
			href={(key) => withParams(page.url, { show: key === 'share' ? null : key })}
		/>
		<Pills
			label="Group by"
			options={[
				['ram', 'RAM'],
				['line', 'Legends']
			]}
			value={data.by}
			href={(key) => withParams(page.url, { by: key === 'ram' ? null : key })}
		/>
	</div>
</header>

{#if trend.times.length < 2}
	<p class="mt-8 text-center text-sm text-muted">
		A trend needs at least two weeks with {MIN_FIELD} or more decks; this period has {trend.times
			.length}.
	</p>
{:else}
	<ul class="mt-4 flex flex-wrap gap-x-2 gap-y-1">
		{#each trend.series as s, i (s.key)}
			<li>
				<button
					class="flex items-center gap-2 rounded-md px-2 py-1 font-mono text-sm hover:bg-surface"
					style:color={data.by === 'ram' ? undefined : stops[i][0].color}
					onmouseenter={() => (focus = s.key)}
					onmouseleave={() => (focus = null)}
					onfocus={() => (focus = s.key)}
					onblur={() => (focus = null)}
				>
					<!-- The line itself, as it is drawn, so the name beside it is the name of that line. -->
					<svg viewBox="0 0 28 8" width="28" height="8" aria-hidden="true">
						{@render gradients(`key-${i}`, 1, 27)}
						<path
							d="M1,4H27"
							fill="none"
							stroke={paint(`key-${i}`, i)}
							stroke-width="3"
							stroke-linecap="round"
						/>
					</svg>
					{#if data.by === 'ram'}
						<RamCode ram={s.key} />
					{:else}
						{name(s.key)}
					{/if}
				</button>
			</li>
		{/each}
	</ul>

	<svg viewBox="0 0 {W} {H}" class="mt-2 w-full" role="img" aria-label="Trend lines, one per deck">
		{@render gradients('line', pad.l, W - pad.r)}
		{#each ticks as tick (tick)}
			<line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} class="stroke-edge/60" />
			<text x={pad.l - 8} y={y(tick) + 4} text-anchor="end" class="fill-muted font-mono text-[11px]"
				>{pct(tick)}</text
			>
		{/each}
		{#if metric === 'winrate'}
			<line
				x1={pad.l}
				x2={W - pad.r}
				y1={y(0.5)}
				y2={y(0.5)}
				class="stroke-muted/50"
				stroke-dasharray="4 4"
			/>
		{/if}
		{#each trend.times as t (t)}
			<text x={x(t)} y={H - 10} text-anchor="middle" class="fill-muted font-mono text-[11px]"
				>{when(t)}</text
			>
		{/each}
		{#each trend.series as s, i (s.key)}
			<g opacity={focus !== null && focus !== s.key ? 0.15 : 1}>
				<path
					d={segments(s.points).solid}
					fill="none"
					stroke={paint('line', i)}
					stroke-width="2.5"
					stroke-linecap="round"
				/>
				<!-- Into a week still running: dashed and faded. -->
				<path
					d={segments(s.points).dashed}
					fill="none"
					stroke={paint('line', i)}
					stroke-width="2.5"
					stroke-dasharray="5 5"
					opacity="0.75"
				/>
				{#each s.points as p (p.t)}
					{@const v = valueOf(p)}
					{#if v !== null}
						<circle
							cx={x(p.t)}
							cy={y(v)}
							r="4"
							fill={unsettled(p) ? 'var(--color-void)' : paint('line', i)}
							stroke={paint('line', i)}
							stroke-width="2"
							opacity={unsettled(p) ? 0.7 : 1}
						>
							<title
								>{name(s.key)} · {when(p.t)}{p.partial ? ' (in progress)' : ''}: {pct(v)} ({p.decks} decks,
								{p.matches} matches)</title
							>
						</circle>
					{/if}
				{/each}
			</g>
		{/each}
		{#each ends as end (end.key)}
			<text
				x={W - pad.r + 10}
				y={end.y + 4}
				class="font-mono text-[12px] tracking-wider"
				opacity={focus !== null && focus !== end.key ? 0.15 : 1}
			>
				{#each lettersOf(end.key) as { letter, color }, n (n)}<tspan fill={color}>{letter}</tspan
					>{/each}
			</text>
		{/each}
	</svg>
	<p class="font-mono text-xs text-muted">
		{#if trend.series.some((s) => s.points.some((p) => p.partial))}
			Dashed and hollow: this week is still in progress, so it may still move (most events are on
			the weekend).
		{/if}
		Shares are of every deck that week, not just these lines.
		{#if metric === 'winrate'}
			A win rate is drawn only where a week has {MIN_MATCHES} or more matches behind it; the dotted line
			is 50%.
		{/if}
	</p>
{/if}
