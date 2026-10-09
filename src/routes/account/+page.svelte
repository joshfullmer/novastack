<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { manageCollection } from '#lib/collection/manage-pref.svelte.js';
	import DiscordSignInButton from '#lib/components/DiscordSignInButton.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The switch is drawn "on" until mounted. The preference lives in `localStorage`, which the server
	// can't read, so the server HTML is always the default (on) and the real value is applied once
	// the page is hydrated — rather than hydrating a state the server never rendered.
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const collectionControls = $derived(mounted ? manageCollection.enabled : true);

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

	<!-- A device setting, so it lives where settings do rather than in the page chrome of the three pages
	     it affects: set once, and it holds for every page on this browser. Not on the account itself —
	     it is stored in `localStorage` (`#lib/collection/manage-pref.svelte.ts`), because those pages are
	     prerendered or edge-cached and cannot know who is looking. -->
	<section class="mt-8 flex flex-col gap-3 border-t border-edge/60 pt-8">
		<h2 class="text-sm font-medium text-bright">On this device</h2>
		<div class="flex items-start justify-between gap-4">
			<div>
				<p id="collection-controls-label" class="text-sm text-body">Collection controls</p>
				<p id="collection-controls-description" class="mt-0.5 text-sm text-muted">
					The owned-count buttons on cards and sets. Turning them off only hides them; your
					collection isn't touched.
				</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={collectionControls}
				aria-labelledby="collection-controls-label"
				aria-describedby="collection-controls-description"
				onclick={() => manageCollection.toggle()}
				class="flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors
					{collectionControls ? 'bg-neon' : 'bg-raised ring-1 ring-edge ring-inset'}"
			>
				<span
					class="size-5 rounded-full transition-transform
						{collectionControls ? 'translate-x-5 bg-void' : 'translate-x-0 bg-muted'}"
				></span>
			</button>
		</div>
	</section>

	<!-- Rare by nature — most people move a collection in once, if ever — so it lives here rather than
	     taking space in the collection's rail. `/collection` points an empty collection at the
	     import. Native `download` link, so Export works without JavaScript. -->
	<section class="mt-8 flex flex-col gap-3 border-t border-edge/60 pt-8">
		<h2 class="text-sm font-medium text-bright">Your data</h2>
		<p class="text-sm text-muted">
			Your collection as a CSV: everything you own, re-importable. Import a CSV from an export or a
			spreadsheet.
		</p>
		<div class="flex gap-4 text-sm">
			<a href="/api/collection/export" download class="text-neon hover:underline"
				>Export collection</a
			>
			<a href="/collection/import" class="text-neon hover:underline">Import collection</a>
		</div>
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
