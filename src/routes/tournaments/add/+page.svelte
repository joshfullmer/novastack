<script lang="ts">
	// How to add a tournament: a bookmarklet that copies the ingest command. The page only explains
	// and hosts the link; the ingest is `pnpm melee` on the maintainer's machine, never this site.
	import Meta from '#lib/components/Meta.svelte';
	import { bookmarklet } from '#lib/tournaments/bookmarklet.js';

	let { data } = $props();
</script>

<Meta
	title="Add a tournament — novastack"
	description="Copy the ingest command for a Melee tournament."
	origin={data.origin}
	path="/tournaments/add"
	noindex
/>

<div>
	<div class="max-w-2xl py-6">
		<h1 class="font-mono text-xl text-bright">Add a tournament</h1>
		<p class="mt-1 font-mono text-xs text-muted">
			Ingest is a command run on your own machine, one event at a time.
		</p>

		<ol class="mt-6 list-decimal space-y-4 pl-5 text-sm">
			<li>
				Drag this to your bookmarks bar:
				<a
					href={bookmarklet()}
					class="ml-1 inline-block rounded border border-neon bg-neon/10 px-2.5 py-1 font-mono text-xs text-bright"
					>Copy melee command</a
				>
			</li>
			<li>
				On <span class="font-mono">melee.gg</span>, click the bookmark. On an event page (<span
					class="font-mono">/Tournament/View/…</span
				>) it copies
				<span class="font-mono">pnpm melee &lt;id&gt;</span>. On a decklist search (<span
					class="font-mono">/Decklists</span
				>, filtered to what you want) it copies one command for every event in the rows on screen
				(25 a page; filter by date or tournament type to narrow it).
			</li>
			<li>
				Paste it in this repo's terminal. It writes your local database; add
				<span class="font-mono">--remote</span> for production once it looks right.
			</li>
		</ol>

		<p class="mt-6 text-xs text-muted">
			The bookmark only reads the address and writes your clipboard — nothing is sent anywhere.
			Steps for production are in <span class="font-mono">docs/runbooks/tournaments-rollout.md</span
			>.
		</p>
	</div>
</div>
