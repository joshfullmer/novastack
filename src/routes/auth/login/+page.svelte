<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import DiscordSignInButton from '#lib/components/DiscordSignInButton.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const justReset = $derived(page.url.searchParams.get('reset') === '1');

	// `error` is set by better-auth's OAuth callback (see social-sign-in.ts's `errorCallbackURL`).
	// `account_not_linked` is the one real case explicit-only linking produces day-to-day —
	// everything else gets a generic message rather than surfacing better-auth's internal codes.
	const discordError = $derived.by(() => {
		const code = page.url.searchParams.get('error');
		if (!code) return null;
		if (code === 'account_not_linked')
			return 'An account with this email already exists. Sign in with your password, then link Discord from your account page.';
		return 'Something went wrong signing in with Discord. Please try again.';
	});
</script>

<svelte:head>
	<title>Sign in — novastack</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-1 flex-col justify-center p-6">
	<h1 class="mb-1 text-xl font-semibold text-bright">Sign in</h1>
	<p class="mb-6 text-sm text-muted">Sign in to build and save decks.</p>

	{#if justReset}
		<p class="mb-4 text-sm text-neon">Password updated — sign in with your new password.</p>
	{/if}

	{#if discordError}
		<p class="mb-4 text-sm text-card-red">{discordError}</p>
	{/if}

	<form method="post" action="?/signInUsername" use:enhance class="flex flex-col gap-3">
		<label class="flex flex-col gap-1 text-sm text-body">
			Username
			<input
				name="username"
				required
				class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
					focus:border-neon focus:outline-none"
			/>
		</label>
		<label class="flex flex-col gap-1 text-sm text-body">
			Password
			<input
				type="password"
				name="password"
				required
				class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
					focus:border-neon focus:outline-none"
			/>
		</label>

		{#if form?.message}
			<p class="text-sm text-card-red">{form.message}</p>
		{/if}

		<button
			type="submit"
			class="mt-2 rounded-md bg-neon px-3 py-2 text-sm font-medium text-void hover:bg-neon-dim"
			>Sign in</button
		>
	</form>

	<div class="my-4 flex items-center gap-2 text-xs text-muted" aria-hidden="true">
		<div class="h-px flex-1 bg-edge"></div>
		or
		<div class="h-px flex-1 bg-edge"></div>
	</div>

	<DiscordSignInButton />

	<div class="mt-4 flex flex-col gap-1">
		<a href="/auth/forgot-password" class="text-sm text-muted hover:text-bright"
			>Forgot your password?</a
		>
		<a href="/auth/register" class="text-sm text-muted hover:text-bright">New here? Register</a>
	</div>
</div>
