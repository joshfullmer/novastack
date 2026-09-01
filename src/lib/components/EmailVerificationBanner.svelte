<script lang="ts">
	/**
	 * Soft-gated: shown, never blocking. Only renders where `page.data.user` is populated
	 * (`/decks`, `/auth`, `/account`) — same subtree Nav's sign-in state already relies on.
	 */
	import { page } from '$app/state';

	const resent = $derived(page.url.searchParams.get('resent') === '1');
	const resendError = $derived(page.url.searchParams.get('resend-error') === '1');
</script>

{#if page.data.user && !page.data.user.emailVerified}
	<div
		class="flex flex-wrap items-center justify-between gap-3 border-b border-edge/60 bg-raised px-4 py-2 text-sm sm:px-6"
	>
		{#if resent}
			<p class="text-body">Verification email sent — check your inbox.</p>
		{:else if resendError}
			<p class="text-body">Couldn't resend right now — try again in a minute.</p>
		{:else}
			<p class="text-body">Verify your email to secure your account.</p>
		{/if}
		<form method="post" action="/auth/resend-verification">
			<input type="hidden" name="returnTo" value={page.url.pathname} />
			<button type="submit" class="text-neon transition-colors hover:text-neon-dim"
				>Resend verification email</button
			>
		</form>
	</div>
{/if}
