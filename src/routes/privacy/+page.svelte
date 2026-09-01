<script lang="ts">
	import Meta from '#lib/components/Meta.svelte';

	let { data } = $props();
</script>

<Meta
	title="Privacy Policy — novastack"
	description="What novastack collects, why, and who it's shared with."
	origin={data.origin}
	path="/privacy"
/>

<article class="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
	<header>
		<h1 class="text-3xl font-semibold tracking-tight text-bright">Privacy Policy</h1>
		<p class="mt-2 text-sm text-muted">Last updated September 1, 2026.</p>
	</header>

	<section>
		<p class="leading-relaxed text-body">
			novastack ("we", "us") is an unofficial, fan-made deckbuilder for the Cyberpunk TCG — see the
			disclaimer at the bottom of every page. This policy covers novastack.gg only: what we collect,
			why, and who it's shared with.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Information we collect</h2>
		<ul class="list-disc space-y-2 pl-5 leading-relaxed text-body">
			<li>
				<strong class="text-bright">Account information.</strong> When you create an account, we store
				your username, email address, and a securely hashed password — we never store your password itself.
				If you sign in with Discord instead, we store the email address and account ID Discord provides,
				and may display the avatar image Discord gives us.
			</li>
			<li>
				<strong class="text-bright">Session information.</strong> To keep you signed in, we store a session
				token and log the IP address and browser/device string tied to each session.
			</li>
			<li>
				<strong class="text-bright">Content you create.</strong> Decks you build (including edit history)
				and decks you like are stored and tied to your account.
			</li>
		</ul>
		<p class="leading-relaxed text-body">
			novastack has no payment or subscription features, so we never collect payment information. We
			don't run analytics, advertising, or tracking scripts of any kind.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">How we use it</h2>
		<p class="leading-relaxed text-body">
			To create and secure your account, keep you signed in, send account-related email (verifying
			your address, letting you reset a forgotten password), and let you build, save, and share
			decks. We don't sell, rent, or share your information with anyone for advertising or
			marketing.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Third-party services</h2>
		<ul class="list-disc space-y-2 pl-5 leading-relaxed text-body">
			<li>
				<strong class="text-bright">Discord.</strong> If you sign in with Discord, novastack
				receives basic profile info from Discord under OAuth, subject to
				<a
					href="https://discord.com/privacy"
					class="underline decoration-dotted hover:text-neon"
					rel="noreferrer">Discord's Privacy Policy</a
				>.
			</li>
			<li>
				<strong class="text-bright">Resend.</strong> Sends our verification and password-reset
				email, subject to
				<a
					href="https://resend.com/legal/privacy-policy"
					class="underline decoration-dotted hover:text-neon"
					rel="noreferrer">Resend's Privacy Policy</a
				>.
			</li>
			<li>
				<strong class="text-bright">Cloudflare.</strong> Hosts novastack and stores its data
				(Workers + D1), subject to
				<a
					href="https://www.cloudflare.com/privacypolicy/"
					class="underline decoration-dotted hover:text-neon"
					rel="noreferrer">Cloudflare's Privacy Policy</a
				>.
			</li>
			<li>
				<strong class="text-bright">api.netdeck.gg.</strong> The source of the public card database shown
				on novastack. No account information is ever sent to or shared with it.
			</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Cookies</h2>
		<p class="leading-relaxed text-body">
			novastack sets a single, strictly-necessary session cookie to keep you signed in. No
			advertising or tracking cookies.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Your choices</h2>
		<p class="leading-relaxed text-body">
			You can update your username, email, or password anytime from
			<a href="/account" class="underline decoration-dotted hover:text-neon">your account page</a>.
			You can also delete your account there at any time — this permanently removes your account,
			decks, and likes, and can't be undone. For anything else, contact us below.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Children's privacy</h2>
		<p class="leading-relaxed text-body">
			novastack isn't directed at children under 13, and we don't knowingly collect information from
			them. If you believe a child has created an account, contact us and we'll remove it.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Changes to this policy</h2>
		<p class="leading-relaxed text-body">
			We may update this policy occasionally. Changes will be posted here with a new "last updated"
			date.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold text-bright">Contact</h2>
		<p class="leading-relaxed text-body">
			Questions about this policy or your data:
			<a href="mailto:admin@novastack.gg" class="underline decoration-dotted hover:text-neon"
				>admin@novastack.gg</a
			>.
		</p>
	</section>
</article>
