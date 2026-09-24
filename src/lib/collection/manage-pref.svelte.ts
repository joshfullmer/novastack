/**
 * "Manage collection" — whether the ownership controls show at all.
 *
 * **On by default**, and stored client-side rather than in a cookie read by `load`, because every
 * surface that shows these controls is either prerendered (`/cards`) or edge-cached with
 * `s-maxage` (`/sets/[id]`, `/cards/[slug]`). A per-user preference rendered into either would be
 * baked into a shared response — the same constraint that drove ownership itself client-side.
 *
 * The flash this would otherwise cause is handled pre-paint in `app.html`, which reads the same
 * key and sets `data-manage-collection="off"` on `<html>` before `<body>` is parsed; `layout.css`
 * hides `[data-collection-ui]` from there. This module is the *behavioural* half — it also lets
 * the page skip fetching the Collection at all when the controls are off, which CSS cannot do.
 */
import { browser } from '$app/env';

export const MANAGE_COLLECTION_KEY = 'manage-collection';

function read(): boolean {
	if (!browser) return true;
	try {
		// Absent means on: the default has to survive a visitor who has never touched the toggle.
		return localStorage.getItem(MANAGE_COLLECTION_KEY) !== 'off';
	} catch {
		return true;
	}
}

function createManageCollection() {
	let enabled = $state(read());

	return {
		get enabled() {
			return enabled;
		},
		toggle() {
			enabled = !enabled;

			try {
				localStorage.setItem(MANAGE_COLLECTION_KEY, enabled ? 'on' : 'off');
			} catch {
				// A blocked localStorage costs persistence, not the toggle itself.
			}

			// Keep the pre-paint attribute in step, so the CSS half agrees with this one for the
			// rest of the session and on the next load.
			if (enabled) delete document.documentElement.dataset.manageCollection;
			else document.documentElement.dataset.manageCollection = 'off';
		}
	};
}

export const manageCollection = createManageCollection();
