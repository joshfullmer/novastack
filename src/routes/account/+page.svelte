<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Account — novastack</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-1 flex-col justify-center p-6">
	<h1 class="mb-6 text-xl font-semibold text-bright">Account</h1>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-bright">Username</h2>
		<form method="post" action="?/updateUsername" use:enhance class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm text-body">
				Username
				<input
					name="username"
					value={data.user?.username}
					required
					class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
						focus:border-neon focus:outline-none"
				/>
			</label>

			{#if form?.section === 'username' && form?.message}
				<p class="text-sm text-card-red">{form.message}</p>
			{/if}
			{#if form?.section === 'username' && form?.success}
				<p class="text-sm text-neon">Username updated.</p>
			{/if}

			<button
				type="submit"
				class="rounded-md bg-neon px-3 py-2 text-sm font-medium text-void hover:bg-neon-dim"
				>Save</button
			>
		</form>
	</section>

	<section class="mt-8 flex flex-col gap-3">
		<h2 class="text-sm font-medium text-bright">Email</h2>
		<p class="text-sm text-muted">Current: {data.user?.email}</p>
		<form method="post" action="?/changeEmail" use:enhance class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm text-body">
				New email
				<input
					type="email"
					name="newEmail"
					required
					class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
						focus:border-neon focus:outline-none"
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm text-body">
				Current password
				<input
					type="password"
					name="password"
					required
					class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
						focus:border-neon focus:outline-none"
				/>
			</label>

			{#if form?.section === 'email' && form?.message}
				<p class="text-sm text-card-red">{form.message}</p>
			{/if}
			{#if form?.section === 'email' && form?.success}
				<p class="text-sm text-neon">
					Check your new address for a link to confirm the change — it won't take effect until then.
				</p>
			{/if}

			<button
				type="submit"
				class="rounded-md bg-neon px-3 py-2 text-sm font-medium text-void hover:bg-neon-dim"
				>Change email</button
			>
		</form>
	</section>

	<section class="mt-8 flex flex-col gap-3 border-t border-edge/60 pt-8">
		<h2 class="text-sm font-medium text-card-red">Delete account</h2>
		<p class="text-sm text-muted">
			Permanent — deletes your decks and everything else tied to this account. Can't be undone.
		</p>
		<form method="post" action="?/deleteAccount" use:enhance class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm text-body">
				Current password
				<input
					type="password"
					name="password"
					required
					class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
						focus:border-neon focus:outline-none"
				/>
			</label>

			{#if form?.section === 'delete' && form?.message}
				<p class="text-sm text-card-red">{form.message}</p>
			{/if}

			<button
				type="submit"
				class="rounded-md border border-card-red px-3 py-2 text-sm font-medium text-card-red
					hover:bg-card-red hover:text-void">Delete my account</button
			>
		</form>
	</section>
</div>
