/**
 * The signed-out **local draft** (`docs/spec/deckbuilder.md` §10.5) — a deck being built in a
 * browser that has no account behind it yet.
 *
 * It lives in `localStorage`, so it is exactly as durable as the browser's site data and says so in
 * the editor ("Local draft only"). Everything read back is **validated, never trusted as typed**:
 * storage is user-editable and outlives the code that wrote it, so a draft from an older shape, or
 * a hand-edited one, must degrade to "no draft" rather than throw inside the editor's constructor.
 */
import * as v from 'valibot';
import { GUIDE_MAX_LENGTH } from './guide.js';
import { DeckVersionPayloadSchema, type DeckVersionPayload } from './schema.js';

export const DRAFT_KEY = 'novastack:deck-draft:v1';

/** The name a deck starts with — the same one `POST /decks/new` gives an account-backed one. */
export const DEFAULT_DECK_NAME = 'New deck';

/**
 * Set before sending a signed-out visitor to sign in with their draft, read by `/decks` — where
 * every sign-in path (password, registration, Discord) lands — to send them back to finish saving.
 * A cookie rather than a `?redirectTo` because there are four ways to sign in and none carries one.
 */
export const RESUME_COOKIE = 'resume-draft';

export type DraftState = {
	name: string;
	payload: DeckVersionPayload;
	bookmarks: string[];
	guide: string;
};

const DraftSchema = v.object({
	name: v.string(),
	payload: DeckVersionPayloadSchema,
	bookmarks: v.array(v.string()),
	guide: v.pipe(v.string(), v.maxLength(GUIDE_MAX_LENGTH))
});

export const EMPTY_PAYLOAD: DeckVersionPayload = { entries: [], legends: [], sideboard: [] };

/** A draft with nothing in it is not worth keeping — and not worth a "draft" label. */
export function isEmptyDraft(draft: DraftState): boolean {
	return (
		draft.payload.entries.length === 0 &&
		draft.payload.legends.length === 0 &&
		draft.payload.sideboard.length === 0 &&
		draft.bookmarks.length === 0 &&
		draft.guide.trim() === '' &&
		(draft.name.trim() === '' || draft.name === DEFAULT_DECK_NAME)
	);
}

/** `null` for no draft, or one that fails validation. Browser only. */
export function loadDraft(): DraftState | null {
	try {
		const raw = localStorage.getItem(DRAFT_KEY);
		if (raw === null) return null;
		return v.parse(DraftSchema, JSON.parse(raw));
	} catch {
		return null;
	}
}

/** Saves the draft, or forgets it when there is nothing in it. Storage can be full or disabled;
 * losing the local copy must never break building, so failure is swallowed. */
export function storeDraft(draft: DraftState): void {
	try {
		if (isEmptyDraft(draft)) localStorage.removeItem(DRAFT_KEY);
		else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
	} catch {
		// Private mode, quota, or storage blocked: the editor still works, the draft just won't survive.
	}
}

export function clearDraft(): void {
	try {
		localStorage.removeItem(DRAFT_KEY);
	} catch {
		// See `storeDraft`.
	}
}
