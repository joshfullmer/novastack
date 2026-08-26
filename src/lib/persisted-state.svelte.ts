/**
 * A `$state` value mirrored to `localStorage`, for a clamped integer UI preference (a density
 * stepper's column count, say) that should survive a reload or a later visit. SSR-safe:
 * `localStorage` doesn't exist during server rendering, so the initial read and every write are
 * guarded — the server always falls back to `initial`.
 *
 * Clamping happens here, in the setter, so every caller gets it for free instead of
 * reimplementing the same `Math.max(min, Math.min(...))`.
 *
 * List/Grid/Gallery-style toggles use `#lib/cookie-state.svelte.ts` instead — see that module's
 * own comment for why a numeric density stepper and a structural toggle need different fixes for
 * the flash a client-only preference would otherwise cause on first render.
 */
export function persistedIntState(
	key: string,
	initial: number,
	range: { min: number; max: number }
) {
	let value = $state(readStoredInt(key, initial, range));

	return {
		get value() {
			return value;
		},
		set value(next: number) {
			value = Math.max(range.min, Math.min(next, range.max));
			if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(value));
		}
	};
}

function readStoredInt(key: string, initial: number, range: { min: number; max: number }): number {
	if (typeof localStorage === 'undefined') return initial;
	const stored = localStorage.getItem(key);
	if (stored === null) return initial;
	const parsed = Number(stored);
	return Number.isInteger(parsed) && parsed >= range.min && parsed <= range.max ? parsed : initial;
}
