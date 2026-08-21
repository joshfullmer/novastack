<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} — novastack</title></svelte:head>

<section class="mx-auto max-w-md px-4 py-24 text-center">
	<p class="font-mono text-sm text-neon">{page.status}</p>
	<h1 class="mt-2 text-2xl font-semibold text-bright">
		{page.status === 404 ? 'No such page' : 'Something went wrong'}
	</h1>
	<p class="mt-3 text-sm text-balance text-muted">
		{page.error?.message ?? 'Try again, or head back to the database.'}
	</p>
	<a
		href="/cards"
		class="mt-6 inline-block rounded-lg border border-edge px-4 py-2
			text-sm text-body transition-colors hover:border-neon hover:text-neon">Browse the cards</a
	>
</section>
