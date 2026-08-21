<script lang="ts">
	/**
	 * Required, not optional. Mirroring and redistributing card art makes this project the
	 * distributor, and the condition on following established fan-database precedent is
	 * disclosure — so the disclaimer is persistent and the source is credited by name.
	 *
	 * Per-printing artist credit lives wherever a printing is shown in detail; this is the
	 * site-wide half of the obligation.
	 */
	let { class: className = '' }: { class?: string } = $props();
</script>

<footer class="border-t border-edge/60 px-4 py-6 text-xs text-muted sm:px-6 {className}">
	<p class="mx-auto max-w-[1800px] leading-relaxed">
		Unofficial fan project. Not associated with or endorsed by the publisher. Card names, art and
		rules text are the property of their respective owners. Card data from
		<a
			href="https://api.netdeck.gg"
			class="text-body underline decoration-dotted underline-offset-2 hover:text-neon"
			rel="noreferrer">api.netdeck.gg</a
		>.
	</p>
</footer>
