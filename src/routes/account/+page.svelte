<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import DiscordSignInButton from '#lib/components/DiscordSignInButton.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Set by better-auth's OAuth callback after a `linkDiscord` redirect (see
	// social-sign-in.ts's `errorCallbackURL`) — `linkDiscord` itself never resolves as a normal
	// form action, so this can't come back as `form.message` the way `unlinkDiscord` does.
	const linkDiscordError = $derived.by(() => {
		const code = page.url.searchParams.get('error');
		if (!code) return null;
		if (code === 'email_does_not_match')
			return "That Discord account's email doesn't match this account's email.";
		if (code === 'account_already_linked_to_different_user')
			return 'That Discord account is already linked to a different novastack account.';
		return 'Something went wrong linking Discord. Please try again.';
	});
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

	<section class="mt-8 flex flex-col gap-3 border-t border-edge/60 pt-8">
		<h2 class="text-sm font-medium text-bright">Linked accounts</h2>

		{#if linkDiscordError}
			<p class="text-sm text-card-red">{linkDiscordError}</p>
		{/if}
		{#if form?.section === 'linked' && form?.message}
			<p class="text-sm text-card-red">{form.message}</p>
		{/if}
		{#if form?.section === 'linked' && form?.success}
			<p class="text-sm text-neon">Discord unlinked.</p>
		{/if}

		{#if data.discordAccountId}
			<form method="post" action="?/unlinkDiscord" use:enhance>
				<input type="hidden" name="accountId" value={data.discordAccountId} />
				<button
					type="submit"
					class="rounded-md border border-edge px-3 py-2 text-sm font-medium text-body
						transition-colors hover:text-bright">Unlink Discord</button
				>
			</form>
		{:else}
			<DiscordSignInButton action="?/linkDiscord" label="Link Discord" />
		{/if}
	</section>

	{#if !data.hasPassword}
		<section id="password" class="mt-8 flex flex-col gap-3 border-t border-edge/60 pt-8">
			<h2 class="text-sm font-medium text-bright">Set a password</h2>
			<p class="text-sm text-muted">
				You signed up with Discord and don't have a password yet. Set one to unlock email changes
				and account deletion below.
			</p>
			<form method="post" action="?/setPassword" use:enhance class="flex flex-col gap-3">
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

				{#if form?.section === 'password' && form?.message}
					<p class="text-sm text-card-red">{form.message}</p>
				{/if}
				{#if form?.section === 'password' && form?.success}
					<p class="text-sm text-neon">Password set.</p>
				{/if}

				<button
					type="submit"
					class="rounded-md bg-neon px-3 py-2 text-sm font-medium text-void hover:bg-neon-dim"
					>Set password</button
				>
			</form>
		</section>
	{/if}

	<section class="mt-8 flex flex-col gap-3 border-t border-edge/60 pt-8">
		<h2 class="text-sm font-medium text-bright">Email</h2>
		{#if data.hasPassword}
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
						Check your new address for a link to confirm the change — it won't take effect until
						then.
					</p>
				{/if}

				<button
					type="submit"
					class="rounded-md bg-neon px-3 py-2 text-sm font-medium text-void hover:bg-neon-dim"
					>Change email</button
				>
			</form>
		{:else}
			<p class="text-sm text-muted">
				Current: {data.user?.email}.
				<a href="#password" class="text-neon hover:underline">Set a password</a> to change your email.
			</p>
		{/if}
	</section>

	<section class="mt-8 flex flex-col gap-3 border-t border-edge/60 pt-8">
		<h2 class="text-sm font-medium text-card-red">Delete account</h2>
		{#if data.hasPassword}
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
		{:else}
			<p class="text-sm text-muted">
				<a href="#password" class="text-neon hover:underline">Set a password</a> to delete your account.
			</p>
		{/if}
	</section>
</div>
