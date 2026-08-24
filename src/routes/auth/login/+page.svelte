<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in — novastack</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-1 flex-col justify-center p-6">
	<h1 class="mb-1 text-xl font-semibold text-bright">Sign in</h1>
	<p class="mb-6 text-sm text-muted">Sign in to build and save decks. New here? Register below.</p>

	<form method="post" action="?/signInEmail" use:enhance class="flex flex-col gap-3">
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
			Name <span class="text-xs text-muted">(for registering only)</span>
			<input
				name="name"
				class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
					focus:border-neon focus:outline-none"
			/>
		</label>

		{#if form?.message}
			<p class="text-sm text-card-red">{form.message}</p>
		{/if}

		<div class="mt-2 flex gap-2">
			<button
				type="submit"
				class="flex-1 rounded-md bg-neon px-3 py-2 text-sm font-medium text-void
					hover:bg-neon-dim">Sign in</button
			>
			<button
				type="submit"
				formaction="?/signUpEmail"
				class="flex-1 rounded-md border border-edge px-3 py-2 text-sm text-body
					hover:border-neon">Register</button
			>
		</div>
	</form>
</div>
