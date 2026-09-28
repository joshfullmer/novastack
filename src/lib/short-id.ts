/**
 * **Share codes** — the short, public identifier in a share URL (`/d/k7m2qx9v4t`).
 *
 * A second identifier alongside the UUID primary key, deliberately. The UUID stays internal:
 * foreign keys, logs, image cache keys. This is the only one anybody reads, types, or pastes into
 * Discord, and the split is what makes it addable to a live database without rewriting a single
 * foreign key (`docs/adr` — see the share-code migration).
 *
 * **Crockford base32, lowercase.** The alphabet drops `i`, `l`, `o` and `u`, which kills the
 * `1`/`l`, `0`/`O` confusions a code read off a screenshot or dictated over voice chat otherwise
 * produces — and drops `u` so the alphabet can't spell the obvious four-letter words. Crockford's
 * canonical form is uppercase, but decoding is defined as case-insensitive, so lowercase is a
 * display choice: it reads better in a URL and is easier to hand-type. Everything is *stored*
 * lowercase, and `normalizeShareCode` folds input to lowercase before any lookup — SQLite's
 * default index collation is case-sensitive, so normalizing on the way in is what keeps the unique
 * index from admitting `K7M2` and `k7m2` as two different codes.
 *
 * **10 characters ≈ 50 bits.** Sized by the secrecy requirement, not the collision one: an
 * `unlisted` deck is protected by nothing but the unguessability of its URL, so the code is a
 * capability. 50 bits needs ~10¹⁵ guesses, which no amount of Worker-rate-limited scanning gets
 * through. Collisions are the easy half — at 100k decks the birthday odds are ~4e-6, and the unique
 * index plus `uniqueShareCode`'s retry makes even that a non-event rather than a lost write.
 */

/** Crockford base32, minus `i`/`l`/`o`/`u`. Exactly 32 symbols — see `randomShareCode`. */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export const SHARE_CODE_LENGTH = 10;

const SHAPE = new RegExp(`^[${ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

/**
 * A fresh code. Uniqueness is *not* checked here — that needs a database, so it lives in
 * `#lib/server/db/share-codes.ts`.
 *
 * `byte & 31` rather than `% 32` is not a micro-optimization but the thing that makes the draw
 * uniform: 256 is an exact multiple of 32, so masking the low 5 bits of a random byte has no
 * modulo bias at all. (A 26-letter alphabet would have needed rejection sampling.)
 */
export function randomShareCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(SHARE_CODE_LENGTH));
	let code = '';
	for (const byte of bytes) code += ALPHABET[byte & 31];
	return code;
}

/**
 * Folds user-supplied input to the stored form, or returns `null` if it can't be one.
 *
 * Applies Crockford's decoding rules, which exist precisely because humans retype these:
 * `i` and `l` become `1`, `o` becomes `0`, hyphens are separators and are dropped, and case is
 * insignificant. So `K7M2-QX9V4T`, `k7m2qx9v4t` and `K7MZ-QXgV4T` typed with an oh-for-zero slip
 * all resolve to the same row instead of a 404 the sender has to debug.
 */
export function normalizeShareCode(value: string): string | null {
	const folded = value
		.trim()
		.toLowerCase()
		.replaceAll('-', '')
		.replaceAll(/[il]/g, '1')
		.replaceAll('o', '0');
	return SHAPE.test(folded) ? folded : null;
}

/**
 * Whether a route param is a share code rather than a UUID.
 *
 * The two are unambiguous by length — 10 vs 36 — which is what lets `/decks/[id]` accept both an
 * old UUID link and a code without a database round trip to find out which it's holding.
 */
export function isShareCode(value: string): boolean {
	return normalizeShareCode(value) !== null;
}
