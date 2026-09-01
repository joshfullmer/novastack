<script lang="ts">
	import { enhance } from '$app/forms';
	import DiscordSignInButton from '#lib/components/DiscordSignInButton.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Register — novastack</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-1 flex-col justify-center p-6">
	<h1 class="mb-1 text-xl font-semibold text-bright">Register</h1>
	<p class="mb-6 text-sm text-muted">Create an account to build and save decks.</p>

	<form method="post" action="?/signUpEmail" use:enhance class="flex flex-col gap-3">
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
		<label class="flex flex-col gap-1 text-sm text-body">
			Email
			<input
				type="email"
				name="email"
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
			>Register</button
		>
	</form>

	<div class="my-4 flex items-center gap-2 text-xs text-muted" aria-hidden="true">
		<div class="h-px flex-1 bg-edge"></div>
		or
		<div class="h-px flex-1 bg-edge"></div>
	</div>

	<DiscordSignInButton />

	<a href="/auth/login" class="mt-4 text-sm text-muted hover:text-bright"
		>Already have an account? Sign in</a
	>
</div>
