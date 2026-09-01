<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Forgot password — novastack</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-1 flex-col justify-center p-6">
	<h1 class="mb-1 text-xl font-semibold text-bright">Forgot your password?</h1>
	<p class="mb-6 text-sm text-muted">
		Enter your account's email and we'll send a link to reset your password.
	</p>

	{#if form?.success}
		<p class="text-sm text-body">If that email exists, check your inbox for a reset link.</p>
	{:else}
		<form method="post" action="?/requestReset" use:enhance class="flex flex-col gap-3">
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
				class="rounded-md bg-neon px-3 py-2 text-sm font-medium text-void hover:bg-neon-dim"
				>Send reset link</button
			>
		</form>
	{/if}

	<a href="/auth/login" class="mt-4 text-sm text-muted hover:text-bright">Back to sign in</a>
</div>
