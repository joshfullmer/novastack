/**
 * The viewer's Collection, client-side.
 *
 * A module-scope singleton rather than a `createX()` factory (the `deck-state` convention),
 * because a Collection is genuinely singular — one per user, unnamed, never created or deleted
 * (`docs/adr/0003-the-collection-is-flat-and-binders-are-showcases.md`). Two independent copies
 * of it on one page would be a bug, not a feature, and several surfaces show ownership at once.
 *
 * It lives on the client because it cannot live in a `load`: `/cards` is prerendered, and
 * `/sets/[id]` and `/cards/[slug]` are edge-cached with `s-maxage`, so per-user data in either
 * would leak between visitors. See `routes/api/collection/+server.ts`.
 *
 * **Writes are optimistic and absolute.** The number updates on tap and the request carries the
 * quantity we want, not a delta — a checklist session is dozens of taps, and round-trip latency
 * per tap is unusable, while a retried delta silently double-counts. Failures roll back to the
 * last server-confirmed value and surface an error, so the UI never quietly disagrees with the DB.
 */
import { browser } from '$app/env';

/** Holding the `+` key shouldn't fire six requests; one settles per Printing per burst. */
const WRITE_DEBOUNCE_MS = 400;

/**
 * A 401 here is the one place the app learns, client-side, that a session has ended — the
 * `signed-in` hint cookie (`#lib/server/signed-in-hint.ts`) outlives it, and on a prerendered or
 * edge-cached page there is no `page.data.user` to correct from.
 *
 * Left alone, the symptom is nasty and hard to diagnose: the header still offers "Account / Sign
 * out" while every ownership control is dead. Clearing the hint makes Nav tell the truth on the
 * next render, which is also the only visible cue that signing in again is what's needed.
 */
function clearSignedInHint(): void {
	document.cookie = 'signed-in=; path=/; max-age=0; samesite=lax';
}

type Status = 'idle' | 'loading' | 'ready' | 'signed-out' | 'error';

function createCollection() {
	/** What we believe the server holds, updated optimistically. */
	let quantities = $state<Record<string, number>>({});
	/** What the server last confirmed, for rollback. Deliberately a plain Map: nothing renders it,
	 * and making it reactive would invalidate every consumer on each confirmation. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const confirmed = new Map<string, number>();

	let status = $state<Status>('idle');
	let errorMessage = $state<string | null>(null);

	// Debounce handles — plain Map, never read by the UI.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	let inFlight = $state(0);

	/**
	 * Guards `load` against re-entry. Deliberately **not** `$state`: callers invoke `load()` from
	 * an `$effect`, and a reactive guard would make the effect depend on state that `load` itself
	 * writes — which re-runs the effect, which calls `load` again. That loop is not theoretical;
	 * an earlier version of this file fired 191 requests on one page view.
	 */
	let started = false;

	/**
	 * Fetches once per page load, lazily. Callers may call it unconditionally from an effect — a
	 * second call is a no-op in every state, including `signed-out` and `error`, so surfaces
	 * don't have to coordinate with each other. Use `retry` to deliberately try again.
	 */
	async function load(): Promise<void> {
		if (!browser || started) return;
		started = true;
		status = 'loading';
		errorMessage = null;

		try {
			const response = await fetch('/api/collection');

			// 401 is the ordinary signed-out case, not a failure worth shouting about: the
			// steppers render disabled and the page still works.
			if (response.status === 401) {
				status = 'signed-out';
				clearSignedInHint();
				return;
			}
			if (!response.ok) throw new Error(`Collection request failed (${response.status})`);

			const body = (await response.json()) as { collection: Record<string, number> };
			quantities = body.collection;
			confirmed.clear();
			for (const [printingId, quantity] of Object.entries(body.collection)) {
				confirmed.set(printingId, quantity);
			}
			status = 'ready';
		} catch (cause) {
			status = 'error';
			errorMessage = cause instanceof Error ? cause.message : 'Could not load your collection';
		}
	}

	function apply(printingId: string, quantity: number) {
		if (quantity <= 0) {
			// Absence, not zero — mirrors the table, where owning none is the lack of a row.
			delete quantities[printingId];
		} else {
			quantities[printingId] = quantity;
		}
	}

	function rollback(printingId: string) {
		apply(printingId, confirmed.get(printingId) ?? 0);
	}

	async function flush(printingId: string, quantity: number) {
		inFlight += 1;
		try {
			const response = await fetch('/api/collection', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ printingId, quantity })
			});
			if (response.status === 401) {
				// The session ended between loading and writing. Roll back, and stop claiming
				// otherwise, rather than leaving a number on screen that was never saved.
				status = 'signed-out';
				clearSignedInHint();
				rollback(printingId);
				errorMessage = 'Your session ended — sign in again to keep tracking.';
				return;
			}
			if (!response.ok) throw new Error(`Save failed (${response.status})`);

			const body = (await response.json()) as { quantity: number };
			confirmed.set(printingId, body.quantity);
			// Only reconcile if nothing has been typed since — otherwise a slow response would
			// stomp a newer optimistic value the user can already see.
			if (!timers.has(printingId)) apply(printingId, body.quantity);
			errorMessage = null;
		} catch (cause) {
			rollback(printingId);
			errorMessage = cause instanceof Error ? cause.message : 'Could not save';
		} finally {
			inFlight -= 1;
		}
	}

	/** Sets a Printing's quantity: optimistic immediately, debounced to the server. */
	function set(printingId: string, quantity: number) {
		if (status === 'signed-out') return;

		const next = Math.max(0, Math.trunc(quantity));
		apply(printingId, next);

		clearTimeout(timers.get(printingId));
		timers.set(
			printingId,
			setTimeout(() => {
				timers.delete(printingId);
				void flush(printingId, next);
			}, WRITE_DEBOUNCE_MS)
		);
	}

	function adjust(printingId: string, delta: number) {
		set(printingId, (quantities[printingId] ?? 0) + delta);
	}

	/** Bulk write — "add every Printing in this Set at 1×". Not debounced; it's one deliberate act. */
	async function setMany(entries: ReadonlyMap<string, number>): Promise<void> {
		if (status === 'signed-out' || entries.size === 0) return;

		// A local rollback snapshot that never escapes this call.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const previous = new Map<string, number>();
		for (const [printingId, quantity] of entries) {
			previous.set(printingId, quantities[printingId] ?? 0);
			apply(printingId, quantity);
		}

		inFlight += 1;
		try {
			const response = await fetch('/api/collection', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items: [...entries].map(([printingId, quantity]) => ({ printingId, quantity }))
				})
			});
			if (!response.ok) throw new Error(`Bulk save failed (${response.status})`);

			for (const [printingId, quantity] of entries) confirmed.set(printingId, quantity);
			errorMessage = null;
		} catch (cause) {
			for (const [printingId, quantity] of previous) apply(printingId, quantity);
			errorMessage = cause instanceof Error ? cause.message : 'Could not save';
		} finally {
			inFlight -= 1;
		}
	}

	/** Explicit re-fetch after a failure — the only way past `load`'s one-shot guard. */
	async function retry(): Promise<void> {
		started = false;
		await load();
	}

	return {
		load,
		retry,
		set,
		adjust,
		setMany,
		/** Owned Count — a single lookup, never a sum across containers. */
		quantityOf: (printingId: string) => quantities[printingId] ?? 0,
		has: (printingId: string) => (quantities[printingId] ?? 0) > 0,
		get status() {
			return status;
		},
		get editable() {
			return status === 'ready';
		},
		get signedOut() {
			return status === 'signed-out';
		},
		get error() {
			return errorMessage;
		},
		get saving() {
			return inFlight > 0;
		},
		/** For consumers that need the whole map — the `owned:` query field, totals. */
		get all(): Readonly<Record<string, number>> {
			return quantities;
		},
		get distinctPrintings() {
			return Object.keys(quantities).length;
		},
		get totalCopies() {
			return Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
		}
	};
}

export const collection = createCollection();
