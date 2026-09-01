<script lang="ts">
	import DiscordIcon from './DiscordIcon.svelte';

	let {
		action = '?/signInDiscord',
		label = 'Continue with Discord'
	}: { action?: string; label?: string } = $props();
</script>

<form method="post" {action}>
	<button
		type="submit"
		class="flex w-full items-center justify-center gap-2 rounded-md border border-edge bg-surface
			px-3 py-2 text-sm font-medium text-body transition-colors hover:text-bright"
	>
		<DiscordIcon class="size-4" />
		{label}
	</button>
</form>
