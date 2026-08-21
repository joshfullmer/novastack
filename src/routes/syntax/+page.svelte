<script lang="ts">
	/**
	 * The Syntax page (spec §11) — a standalone reference and tutorial for the query language.
	 *
	 * No Scryfall familiarity is assumed: this teaches the language on its own terms, since a
	 * Cyberpunk TCG fan site's audience can't be assumed to have used Scryfall.
	 *
	 * **The field/keyword table renders straight from `FIELDS`** (`#lib/query/vocabulary.js`) —
	 * the parser's own source of truth — so a new field or alias can't be added without this page
	 * picking it up. **Every worked example is asserted to parse** in `examples.spec.ts`, against
	 * the real, current dataset — the second anti-drift mechanism spec §11 calls for.
	 */
	import { FIELDS, type FieldKind } from '#lib/query/index.js';
	import { EXAMPLES } from '#lib/query/examples.js';

	const FIELD_LABELS: Record<FieldKind, string> = {
		color: 'Color',
		cardType: 'Card Type',
		keyword: 'Keyword',
		tag: 'Tag',
		cost: 'Cost',
		power: 'Power',
		ram: 'RAM',
		eddiable: 'Eddiable',
		set: 'Set',
		rarity: 'Rarity',
		name: 'Name',
		rules: 'Rules text',
		text: 'Bare word',
		legends: 'Legend colors (RAM budget)'
	};

	function operatorList(field: (typeof FIELDS)[number]): string {
		const base = field.comparisons ? ': = < <= > >=' : ': =';
		return field.value === 'legends' ? ':' : base;
	}
</script>

<svelte:head>
	<title>Syntax — novastack</title>
	<meta
		name="description"
		content="The novastack query language: fields, operators, and worked examples."
	/>
</svelte:head>

<article class="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
	<header>
		<h1 class="text-3xl font-semibold tracking-tight text-bright">Query syntax</h1>
		<p class="mt-3 leading-relaxed text-body">
			The search box on <a href="/cards" class="underline decoration-dotted hover:text-neon"
				>the card database</a
			>
			accepts more than plain words. A query is one or more clauses, combined with
			<code class="rounded bg-raised px-1 py-0.5 text-sm">or</code>
			and implicit "and", and grouped with parentheses. Prefix a clause with
			<code class="rounded bg-raised px-1 py-0.5 text-sm">-</code> to negate it.
		</p>
		<p class="mt-2 leading-relaxed text-body">
			A bare word searches names and rules text; every other field needs a keyword, written as
			<code class="rounded bg-raised px-1 py-0.5 text-sm">field:value</code>. Field names and values
			are case-insensitive. A value with a space needs quotes, e.g.
			<code class="rounded bg-raised px-1 py-0.5 text-sm">tag:"Tyger Claws"</code>.
		</p>
	</header>

	<section>
		<h2 class="text-xl font-semibold text-bright">Precedence</h2>
		<p class="mt-2 leading-relaxed text-body">
			From tightest to loosest binding: parentheses, then negation (<code
				class="rounded bg-raised px-1 py-0.5 text-sm">-</code
			>), then implicit "and" (writing two clauses next to each other), then
			<code class="rounded bg-raised px-1 py-0.5 text-sm">or</code>. One thing worth knowing by
			heart: <code class="rounded bg-raised px-1 py-0.5 text-sm">a or b c</code> means
			<code class="rounded bg-raised px-1 py-0.5 text-sm">a or (b c)</code>, not
			<code class="rounded bg-raised px-1 py-0.5 text-sm">(a or b) c</code> — "and" grabs everything
			up to the next <code class="rounded bg-raised px-1 py-0.5 text-sm">or</code>.
		</p>
	</section>

	<section>
		<h2 class="text-xl font-semibold text-bright">Fields</h2>
		<div class="mt-3 overflow-x-auto rounded-lg border border-edge/60">
			<table class="w-full text-left text-sm">
				<thead class="bg-raised/60 text-xs tracking-wide text-muted uppercase">
					<tr>
						<th class="px-3 py-2">Field</th>
						<th class="px-3 py-2">Keyword(s)</th>
						<th class="px-3 py-2">Operators</th>
						<th class="px-3 py-2">Value</th>
						<th class="px-3 py-2">none / has</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-edge/40">
					{#each FIELDS as field (field.kind)}
						<tr>
							<td class="px-3 py-2 font-medium text-bright">{FIELD_LABELS[field.kind]}</td>
							<td class="px-3 py-2 font-mono text-xs text-body">
								{field.canonical === null
									? '(none — bare word)'
									: [field.canonical, ...field.aliases].map((k) => `${k}:`).join(', ')}
							</td>
							<td class="px-3 py-2 font-mono text-xs text-body">{operatorList(field)}</td>
							<td class="px-3 py-2 text-body">{field.value}</td>
							<td class="px-3 py-2 text-body">{field.nullable ? 'yes' : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section>
		<h2 class="text-xl font-semibold text-bright">Null semantics</h2>
		<p class="mt-2 leading-relaxed text-body">
			A missing value is never the same as zero. Some cards have no cost, no power, no RAM
			requirement, no tags, or no rules text at all — that's a distinct state, not a value of zero
			or an empty string. A plain range or comparison (<code
				class="rounded bg-raised px-1 py-0.5 text-sm">cost>=2</code
			>) never matches a card missing that field.
		</p>
		<p class="mt-2 leading-relaxed text-body">
			To reach that state directly, every nullable field accepts
			<code class="rounded bg-raised px-1 py-0.5 text-sm">field:none</code> (has no value — or, for
			Tag and Keyword, no values at all) and
			<code class="rounded bg-raised px-1 py-0.5 text-sm">field:has</code> (has some value). To
			combine a range with the null bucket, use
			<code class="rounded bg-raised px-1 py-0.5 text-sm">or</code>:
			<code class="rounded bg-raised px-1 py-0.5 text-sm">(cost&gt;=2 cost&lt;=4) or cost:none</code
			>.
		</p>
	</section>

	<section>
		<h2 class="text-xl font-semibold text-bright">Legend colors</h2>
		<p class="mt-2 leading-relaxed text-body">
			<code class="rounded bg-raised px-1 py-0.5 text-sm">legends:</code> filters by the colored RAM
			budget a deck's three Legends would provide. Its value is color letters (<code
				class="rounded bg-raised px-1 py-0.5 text-sm">r</code
			>,
			<code class="rounded bg-raised px-1 py-0.5 text-sm">y</code>,
			<code class="rounded bg-raised px-1 py-0.5 text-sm">g</code>,
			<code class="rounded bg-raised px-1 py-0.5 text-sm">b</code>), each optionally followed by a
			number: a bare letter is worth 1, a number after it sets that amount, and repeats add up.
			<code class="rounded bg-raised px-1 py-0.5 text-sm">legends:rryyyy</code>
			and <code class="rounded bg-raised px-1 py-0.5 text-sm">legends:r2y4</code> both mean Red 2, Yellow
			4.
		</p>
	</section>

	<section>
		<h2 class="text-xl font-semibold text-bright">Regex</h2>
		<p class="mt-2 leading-relaxed text-body">
			A bare word, <code class="rounded bg-raised px-1 py-0.5 text-sm">name:</code>, and
			<code class="rounded bg-raised px-1 py-0.5 text-sm">rules:</code> also accept a regular
			expression between slashes, e.g.
			<code class="rounded bg-raised px-1 py-0.5 text-sm">/bloc+ker/</code>. Patterns matching a few
			well-known catastrophic shapes are rejected rather than run.
		</p>
	</section>

	<section>
		<h2 class="text-xl font-semibold text-bright">Worked examples</h2>
		<p class="mt-2 leading-relaxed text-body">Each one is a live link into the card database.</p>
		<ul class="mt-3 divide-y divide-edge/40 rounded-lg border border-edge/60">
			{#each EXAMPLES as example (example.query)}
				<li class="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
					<a
						href="/cards?q={encodeURIComponent(example.query)}"
						class="font-mono text-neon underline decoration-dotted underline-offset-2 hover:text-bright"
						>{example.query}</a
					>
					<span class="text-muted">{example.description}</span>
				</li>
			{/each}
		</ul>
	</section>
</article>
