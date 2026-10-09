<script lang="ts">
	/**
	 * A labelled text input in the settings forms' one style. `hideLabel` keeps the label for screen
	 * readers when the surrounding row already says what the field is, instead of saying it twice.
	 * `autocomplete` is required rather than optional: a password field with none is a field a
	 * password manager guesses at.
	 */
	let {
		label,
		name,
		autocomplete,
		type = 'text',
		value,
		required = true,
		hideLabel = false
	}: {
		label: string;
		name: string;
		autocomplete: AutoFill;
		type?: 'text' | 'email' | 'password';
		/** `null` is an empty field, for a value the account simply doesn't have yet. */
		value?: string | null;
		required?: boolean;
		hideLabel?: boolean;
	} = $props();
</script>

<label class="flex flex-col gap-1 text-sm text-body">
	<span class={hideLabel ? 'sr-only' : ''}>{label}</span>
	<input
		{name}
		{type}
		value={value ?? ''}
		{required}
		{autocomplete}
		class="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-body
			focus:border-neon focus:outline-none"
	/>
</label>
