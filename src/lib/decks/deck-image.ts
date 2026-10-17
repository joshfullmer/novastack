/**
 * Client-side canvas deck-image export (`docs/spec/deckbuilder.md` §6) — composited entirely in
 * the browser from the deck's already-mirrored, same-origin static card art. No new backend
 * surface: server-rendered images at a stable URL were considered and rejected in the spec (a
 * `satori` + `resvg-wasm` rendering pipeline for a capability client-side canvas already covers).
 *
 * Two layouts, one look: a near-black base with the deck's Legend colors as accents, the site's mono
 * face (Monaspace Krypton) for all text, and a slim footer with the wordmark and a QR code.
 * `spread` shows the deck as art (`deck-image-spread.ts`); `list` shows it as a decklist
 * (`deck-image-list.ts`).
 * Both are 1600×1000 and grow taller only when the cards can't fit at a legible size.
 */
import { loadFonts, type DeckImageOptions } from './deck-image-canvas.js';
import { composeList } from './deck-image-list.js';
import { composeSpread } from './deck-image-spread.js';

export type { DeckImageLayout } from './deck-image-canvas.js';

export async function composeDeckImage(options: DeckImageOptions): Promise<Blob | null> {
	await loadFonts();
	const canvas =
		options.layout === 'spread' ? await composeSpread(options) : await composeList(options);
	if (!canvas) return null;
	return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
