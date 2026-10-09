<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { manageCollection } from '#lib/collection/manage-pref.svelte.js';
	import DiscordSignInButton from '#lib/components/DiscordSignInButton.svelte';
	import PriceSourceToggle from '#lib/components/PriceSourceToggle.svelte';
	import SettingRow from '#lib/components/settings/SettingRow.svelte';
	import SettingsPanel from '#lib/components/settings/SettingsPanel.svelte';
	import Switch from '#lib/components/settings/Switch.svelte';
	import TextField from '#lib/components/settings/TextField.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/**
	 * The two device settings live in `localStorage`, which the server can't read, so the server HTML
	 * is always the defaults. They are drawn as those defaults until mounted and the real values are
	 * applied then — rather than hydrating a state the server never rendered, which Svelte would
	 * keep as it found it.
	 */
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const collectionControls = $derived(mounted ? manageCollection.enabled : true);

	/** The page is one scroll; this is its table of contents. */
	const sections = [
		{ id: 'profile', label: 'Profile' },
		{ id: 'preferences', label: 'On this device' },
		{ id: 'security', label: 'Sign-in & security' },
		{ id: 'data', label: 'Your data' },
		{ id: 'danger', label: 'Danger zone' }
	] as const;

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

	const primaryButton =
		'rounded-md bg-neon px-3 py-2 text-sm font-medium text-void hover:bg-neon-dim';
	const secondaryButton =
		'rounded-md border border-edge px-3 py-2 text-sm font-medium text-body transition-colors hover:border-neon-dim hover:text-bright';
</script>

<svelte:head>
	<title>Account — novastack</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
	<h1 class="text-2xl font-semibold text-bright">Account</h1>
	<p class="mt-1 text-sm text-muted">{data.user?.email}</p>

	<div class="mt-8 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-12">
		<!-- Anchor links to the sections below, nothing more: every setting is on this one page. A strip
		     that scrolls sideways on a phone, a sticky list beside the panels on a wide screen. -->
		<nav
			aria-label="Account sections"
			class="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:sticky
				lg:top-[calc(var(--spacing-nav)+1.5rem)] lg:m-0 lg:flex-col lg:overflow-visible lg:p-0"
		>
			{#each sections as section (section.id)}
				<a
					href="#{section.id}"
					class="shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted transition-colors
						hover:bg-surface {section.id === 'danger' ? 'hover:text-card-red' : 'hover:text-bright'}"
					>{section.label}</a
				>
			{/each}
		</nav>

		<div class="flex min-w-0 flex-col gap-6">
			<SettingsPanel id="profile" title="Profile">
				<SettingRow
					id="username"
					title="Username"
					description="Shown as the author of the decks you share."
				>
					<form method="post" action="?/updateUsername" use:enhance class="flex flex-col gap-3">
						<TextField
							label="Username"
							name="username"
							autocomplete="username"
							value={data.user?.username}
							hideLabel
						/>

						{#if form?.section === 'username' && form?.message}
							<p class="text-sm text-card-red">{form.message}</p>
						{/if}
						{#if form?.section === 'username' && form?.success}
							<p class="text-sm text-neon">Username updated.</p>
						{/if}

						<button type="submit" class="{primaryButton} w-fit">Save</button>
					</form>
				</SettingRow>
			</SettingsPanel>

			<!-- Device settings, so they live where settings do rather than in the page chrome of the
			     pages they affect: set once, held on every page in this browser. Not on the account
			     itself — each is stored in `localStorage` (`#lib/collection/manage-pref.svelte.ts`,
			     `#lib/prices/source.svelte.ts`), because those pages are prerendered or edge-cached and
			     cannot know who is looking. -->
			<SettingsPanel
				id="preferences"
				title="On this device"
				description="Saved in this browser, so each device keeps its own."
			>
				<SettingRow
					id="collection-controls"
					title="Collection controls"
					description="The owned-count buttons on cards and sets. Turning them off only hides them; your collection isn't touched."
					align="end"
				>
					<Switch
						checked={collectionControls}
						onclick={() => manageCollection.toggle()}
						labelledby="collection-controls-label"
						describedby="collection-controls-description"
					/>
				</SettingRow>

				<SettingRow
					id="price-source"
					title="Prices"
					description="Which marketplace to show prices from: TCGplayer in dollars or Cardmarket in euros. One at a time, never converted."
					align="end"
				>
					{#if mounted}
						<PriceSourceToggle size="md" />
					{:else}
						<!-- Holds the control's place until the saved choice is known, so it doesn't jump. -->
						<span class="inline-block h-9 w-52" aria-hidden="true"></span>
					{/if}
				</SettingRow>
			</SettingsPanel>

			<SettingsPanel id="security" title="Sign-in & security">
				<SettingRow
					id="linked"
					title="Discord"
					description="Sign in with your Discord account as well as with your email."
				>
					<div class="flex flex-col gap-3">
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
								<button type="submit" class={secondaryButton}>Unlink Discord</button>
							</form>
						{:else}
							<DiscordSignInButton action="?/linkDiscord" label="Link Discord" />
						{/if}
					</div>
				</SettingRow>

				{#if !data.hasPassword}
					<SettingRow
						id="password"
						title="Set a password"
						description="You signed up with Discord and don't have a password yet. Set one to unlock email changes and account deletion."
					>
						<form method="post" action="?/setPassword" use:enhance class="flex flex-col gap-3">
							<TextField
								label="New password"
								name="newPassword"
								type="password"
								autocomplete="new-password"
							/>

							{#if form?.section === 'password' && form?.message}
								<p class="text-sm text-card-red">{form.message}</p>
							{/if}
							{#if form?.section === 'password' && form?.success}
								<p class="text-sm text-neon">Password set.</p>
							{/if}

							<button type="submit" class="{primaryButton} w-fit">Set password</button>
						</form>
					</SettingRow>
				{/if}

				<SettingRow id="email" title="Email" description="Currently {data.user?.email}.">
					{#if data.hasPassword}
						<form method="post" action="?/changeEmail" use:enhance class="flex flex-col gap-3">
							<TextField label="New email" name="newEmail" type="email" autocomplete="email" />
							<TextField
								label="Current password"
								name="password"
								type="password"
								autocomplete="current-password"
							/>

							{#if form?.section === 'email' && form?.message}
								<p class="text-sm text-card-red">{form.message}</p>
							{/if}
							{#if form?.section === 'email' && form?.success}
								<p class="text-sm text-neon">
									Check your new address for a link to confirm the change — it won't take effect
									until then.
								</p>
							{/if}

							<button type="submit" class="{primaryButton} w-fit">Change email</button>
						</form>
					{:else}
						<p class="text-sm text-muted">
							<a href="#password" class="text-neon hover:underline">Set a password</a> to change your
							email.
						</p>
					{/if}
				</SettingRow>
			</SettingsPanel>

			<!-- Rare by nature — most people move a collection in once, if ever — so it lives here rather
			     than taking space in the collection's rail. `/collection` points an empty collection at
			     the import. Native `download` link, so Export works without JavaScript. -->
			<SettingsPanel id="data" title="Your data">
				<SettingRow
					id="collection-data"
					title="Collection"
					description="Everything you own as a CSV, re-importable. Or bring one in from an export or a spreadsheet."
				>
					<div class="flex flex-wrap gap-2">
						<a href="/api/collection/export" download class={secondaryButton}>Export collection</a>
						<a href="/collection/import" class={secondaryButton}>Import collection</a>
					</div>
				</SettingRow>
			</SettingsPanel>

			<SettingsPanel id="danger" title="Danger zone" tone="danger">
				<SettingRow
					id="delete-account"
					title="Delete account"
					description="Permanent: deletes your decks and everything else tied to this account. It can't be undone."
				>
					{#if data.hasPassword}
						<form method="post" action="?/deleteAccount" use:enhance class="flex flex-col gap-3">
							<TextField
								label="Current password"
								name="password"
								type="password"
								autocomplete="current-password"
							/>

							{#if form?.section === 'delete' && form?.message}
								<p class="text-sm text-card-red">{form.message}</p>
							{/if}

							<button
								type="submit"
								class="w-fit rounded-md border border-card-red px-3 py-2 text-sm font-medium text-card-red
									hover:bg-card-red hover:text-void">Delete my account</button
							>
						</form>
					{:else}
						<p class="text-sm text-muted">
							<a href="#password" class="text-neon hover:underline">Set a password</a> to delete your
							account.
						</p>
					{/if}
				</SettingRow>
			</SettingsPanel>
		</div>
	</div>
</div>
