<script lang="ts">
	import Meta from '#lib/components/Meta.svelte';

	let { data } = $props();
</script>

<Meta
	title="Terms of Service — novastack"
	description="The terms for using novastack."
	origin={data.origin}
	path="/terms"
/>

<article class="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
	<header>
		<h1 class="text-3xl font-semibold tracking-tight text-bright">Terms of Service</h1>
		<p class="mt-2 text-sm text-muted">Last updated September 1, 2026.</p>
	</header>

	<section>
		<p class="leading-relaxed text-body">
			By using novastack, you agree to these terms. If you don't agree, please don't use the site.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">What novastack is</h2>
		<p class="leading-relaxed text-body">
			novastack is an unofficial, fan-made deckbuilding tool for the Cyberpunk TCG. It isn't
			associated with, endorsed by, or operated on behalf of the game's publisher. Card names,
			artwork, and rules text remain the property of their respective owners; card data is sourced
			from
			<a
				href="https://api.netdeck.gg"
				class="underline decoration-dotted hover:text-neon"
				rel="noreferrer">api.netdeck.gg</a
			>.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Accounts</h2>
		<p class="leading-relaxed text-body">
			Give accurate information when you create an account, and keep your credentials secure —
			you're responsible for activity under your account. Use one account per person; don't
			impersonate anyone else. If you sign in with Discord, that sign-in is also subject to
			<a
				href="https://discord.com/terms"
				class="underline decoration-dotted hover:text-neon"
				rel="noreferrer">Discord's own Terms of Service</a
			>.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Your content</h2>
		<p class="leading-relaxed text-body">
			Decks you build are yours. Saving one grants novastack the license needed to store, display,
			and — if you set it public or unlisted — show it to other users, according to the visibility
			you choose. Don't create or upload content that's illegal, infringing, or abusive.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Acceptable use</h2>
		<p class="leading-relaxed text-body">Don't:</p>
		<ul class="list-disc space-y-2 pl-5 leading-relaxed text-body">
			<li>disrupt, overload, or scrape the site beyond normal use</li>
			<li>try to bypass rate limits or security, or access another user's account or data</li>
			<li>use novastack for anything illegal</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Availability</h2>
		<p class="leading-relaxed text-body">
			novastack is a hobby project, provided "as is" and "as available," with no uptime guarantee.
			Features — or the site itself — may change or be discontinued at any time without notice.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Limitation of liability</h2>
		<p class="leading-relaxed text-body">
			To the fullest extent the law allows, novastack and its operator aren't liable for any damages
			arising from your use of, or inability to use, the site — including lost data such as decks.
			Keep your own copies of anything important to you.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Termination</h2>
		<p class="leading-relaxed text-body">
			You can delete your account at any time from
			<a href="/account" class="underline decoration-dotted hover:text-neon">your account page</a>.
			We may suspend or terminate access for anyone who violates these terms or abuses the service.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Changes to these terms</h2>
		<p class="leading-relaxed text-body">
			We may update these terms occasionally. Continuing to use novastack after a change means you
			accept the update.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Contact</h2>
		<p class="leading-relaxed text-body">
			Questions about these terms:
			<a href="mailto:admin@novastack.gg" class="underline decoration-dotted hover:text-neon"
				>admin@novastack.gg</a
			>.
		</p>
	</section>
</article>
