<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Choose a username — novastack</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-1 flex-col justify-center p-6">
	<h1 class="mb-1 text-xl font-semibold text-bright">Choose a username</h1>
	<p class="mb-6 text-sm text-muted">
		One more step — pick a username for your account. You can change it later from your account
		page.
	</p>

	<form method="post" action="?/setUsername" use:enhance class="flex flex-col gap-3">
		<label class="flex flex-col gap-1 text-sm text-body">
			Username
			<input
				name="username"
				required
				value={data.suggestion}
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
			>Continue</button
		>
	</form>
</div>
