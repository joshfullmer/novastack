<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Reset password — novastack</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-1 flex-col justify-center p-6">
	<h1 class="mb-1 text-xl font-semibold text-bright">Set a new password</h1>
	<p class="mb-6 text-sm text-muted">Signing in elsewhere will require the new password too.</p>

	<form method="post" action="?/resetPassword" use:enhance class="flex flex-col gap-3">
		<input type="hidden" name="token" value={data.token} />
		<label class="flex flex-col gap-1 text-sm text-body">
			New password
			<input
				type="password"
				name="newPassword"
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
			>Set password</button
		>
	</form>
</div>
