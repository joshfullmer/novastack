/**
 * Showing a price honestly: its currency, and how old it is.
 *
 * Each marketplace keeps its own currency — USD and EUR are never mixed or converted, because the
 * two sources measure different things (TCGplayer's market price is recent sales, Cardmarket's
 * trend is a smoothed average) and a silent conversion would make them look comparable.
 */

export type Currency = 'USD' | 'EUR';

/** Integer minor units → `$1,576.50`, `€0.20`. `en-US` for both so the symbol leads and the grouping matches. */
export function formatMoney(minor: number, currency: Currency): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

const HOUR_MS = 60 * 60 * 1000;

/** Both sources rebuild daily, so two days is "something is late", and a week is "stop showing it". */
export const STALE_AFTER_MS = 48 * HOUR_MS;
export const EXPIRED_AFTER_MS = 7 * 24 * HOUR_MS;

/**
 * - `fresh` — show it.
 * - `stale` — show it, dimmed, and say when it is from.
 * - `expired` — a broken refresh has left it so old that a number would mislead; show the link only.
 */
export type Freshness = 'fresh' | 'stale' | 'expired';

export function freshness(updatedAt: string, now: number): Freshness {
	const age = now - Date.parse(updatedAt);
	if (age > EXPIRED_AFTER_MS) return 'expired';
	return age > STALE_AFTER_MS ? 'stale' : 'fresh';
}

/** `Oct 7`, in the reader's own timezone — the date a source rebuilt, not a timestamp to parse. */
export function formatUpdated(updatedAt: string): string {
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
		new Date(updatedAt)
	);
}
