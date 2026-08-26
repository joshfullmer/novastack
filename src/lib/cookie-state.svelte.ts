/**
 * A `$state` value seeded from the server — a `load` function already read the cookie via
 * `#lib/server/view-pref.ts` and passed it down as page data — and written back to that same
 * cookie on every change, so the *next* request already renders correctly. Pairs with a
 * server-rendered, plain `{#if}` toggle: there is deliberately no client-only correction step
 * here (unlike `#lib/persisted-state.svelte.ts`), because there is nothing left to correct —
 * the server already rendered the right branch.
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function cookieState<T extends string>(key: string, initial: T) {
	let value = $state(initial);

	return {
		get value() {
			return value;
		},
		set value(next: T) {
			value = next;
			if (typeof document !== 'undefined') {
				document.cookie = `${key}=${next}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
			}
		}
	};
}
