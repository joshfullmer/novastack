/**
 * Deck-size readout color — an innocuous status tint (Piltover Archive's own convention),
 * not a blocking validation state; §4 of `docs/spec/deckbuilder.md` is explicit that size never
 * blocks saving.
 *
 * Written as literal strings, not composed — Tailwind discovers classes by scanning source text.
 */
import type { SizeStatus } from './legality.js';

export const SIZE_STATUS_TONE: Record<SizeStatus, string> = {
	under: 'text-card-yellow',
	legal: 'text-card-green',
	over: 'text-card-red'
};
