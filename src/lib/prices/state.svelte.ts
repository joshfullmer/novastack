/**
 * The price snapshot, client-side.
 *
 * Fetched, not bundled and not part of any `load`: the pages that show prices are prerendered or
 * edge-cached, and prices move daily — baking them into either would freeze them at deploy time.
 * It is the same file for every visitor (no per-user data, unlike the Collection), so a cached
 * copy is always correct to serve; the browser revalidates it against the static asset's ETag.
 *
 * A module-scope singleton for the same reason as `collection`: every surface that shows a price
 * wants the one snapshot, and several can be on a page at once.
 */
import { browser } from '$app/env';
import * as v from 'valibot';
import { PricesSchema, type Prices, type Quote } from './schema.ts';

type Status = 'idle' | 'loading' | 'ready' | 'error';

function createPrices() {
	let snapshot = $state<Prices | null>(null);
	let status = $state<Status>('idle');

	/**
	 * Guards `load` against re-entry, and deliberately **not** `$state`: surfaces call `load()` from
	 * an `$effect`, and a reactive guard would make that effect depend on state `load` itself
	 * writes — the loop `collection` once turned into 191 requests on one page view.
	 */
	let started = false;

	/** Idempotent, so every component that shows a price can call it without coordinating. */
	async function load(): Promise<void> {
		if (!browser || started) return;
		started = true;
		status = 'loading';

		try {
			const response = await fetch('/prices.json');
			if (!response.ok) throw new Error(`Prices request failed (${response.status})`);
			snapshot = v.parse(PricesSchema, await response.json());
			status = 'ready';
		} catch {
			// A page without prices is a normal page. Nothing here is worth interrupting for.
			status = 'error';
		}
	}

	return {
		load,
		get status() {
			return status;
		},
		/** `undefined` before load, and for a Printing no marketplace lists. */
		quote: (printingId: string): Quote | undefined => snapshot?.quotes[printingId],
		get tcgplayerUpdatedAt(): string | null {
			return snapshot?.tcgplayer.updatedAt ?? null;
		},
		get cardmarketUpdatedAt(): string | null {
			return snapshot?.cardmarket.updatedAt ?? null;
		}
	};
}

export const prices = createPrices();
