/**
 * Which marketplace's prices to show: TCGplayer or Cardmarket, never both at once.
 *
 * One at a time because they are different measures in different currencies (TCGplayer's market
 * price is recent sales in USD, Cardmarket's trend a smoothed average in EUR), and showing both on
 * every card and every total is noise for someone who buys from only one of them — usually decided
 * by which side of the Atlantic they live on. A choice is also what keeps the strict rule honest:
 * the figure on screen is *the* price, in the currency the reader actually pays in, never a pair to
 * reconcile and never a conversion.
 *
 * **Client-side, in `localStorage`**, for the reason `manage-pref.svelte.ts` documents: every surface
 * that shows a price is prerendered or edge-cached, so a per-visitor preference cannot be rendered
 * into the response. Unlike that one there is no pre-paint flash to head off — prices arrive from a
 * fetch after the page, so nothing is on screen to be wrong when the preference is read.
 *
 * Defaults to TCGplayer: its join covers far more printings than Cardmarket's (458 of 720 against
 * 255 — `docs/research/prices.md` §4), so it is the marketplace most likely to have a price to show
 * on a first visit. Someone on Cardmarket switches once and it is remembered.
 */
import { browser } from '$app/env';
import type { Marketplace } from './cost.ts';

export const PRICE_SOURCE_KEY = 'price-source';
export const DEFAULT_PRICE_SOURCE: Marketplace = 'tcgplayer';

/** A stored value that is not exactly one of the two marketplaces is the default, not an error. */
export function parsePriceSource(raw: string | null): Marketplace {
	return raw === 'tcgplayer' || raw === 'cardmarket' ? raw : DEFAULT_PRICE_SOURCE;
}

function read(): Marketplace {
	if (!browser) return DEFAULT_PRICE_SOURCE;
	try {
		return parsePriceSource(localStorage.getItem(PRICE_SOURCE_KEY));
	} catch {
		return DEFAULT_PRICE_SOURCE;
	}
}

function createPriceSource() {
	let current = $state<Marketplace>(read());

	return {
		get value(): Marketplace {
			return current;
		},
		set(next: Marketplace) {
			current = next;
			try {
				localStorage.setItem(PRICE_SOURCE_KEY, next);
			} catch {
				// A blocked localStorage costs persistence, not the choice itself.
			}
		}
	};
}

export const priceSource = createPriceSource();
