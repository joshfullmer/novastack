/**
 * A Transcript as a link: `/notation/check#g=<encoded>`.
 *
 * The game rides in the URL **hash**, which never reaches the server — so the checker stays a
 * prerendered static page, there is nothing to store or migrate, and a link works for as long as
 * the page does. A short-code layer (`/n/[code]` redirecting here, like `/l/[code]`) can be added
 * in front later without breaking any link made with this.
 *
 * The encoding is plain UTF-8 → base64url: synchronous, runs the same in the browser, Node and a
 * prerender, and a typical game is a few hundred characters, well inside a URL. It is deliberately
 * **unversioned** — no prefix — because nothing has been shared yet; a second encoding can claim a
 * marker when something forces one, and today's links are then simply "no marker".
 *
 * **Canonical:** the same game always yields the same link. Line endings are normalised, trailing
 * whitespace dropped, and blank lines around the game trimmed. Interior blank lines are kept — a
 * blank line mid-game is an error the checker reports, not formatting.
 */

const KEY = 'g';

export function canonicalize(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.trimEnd())
		.join('\n')
		.replace(/^\n+|\n+$/g, '');
}

export function encode(text: string): string {
	const bytes = new TextEncoder().encode(canonicalize(text));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** The text an `encode` produced, or null if `encoded` is not one. Never throws. */
export function decode(encoded: string): string | null {
	if (!/^[A-Za-z0-9_-]*$/.test(encoded)) return null;
	try {
		const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

/** `#g=…` for a game, or the empty string for an empty one — there is nothing to share. */
export function toHash(text: string): string {
	const canonical = canonicalize(text);
	return canonical ? `#${KEY}=${encode(canonical)}` : '';
}

/** The game in a `location.hash`, or null when it carries none or carries garbage. */
export function fromHash(hash: string): string | null {
	const value = new URLSearchParams(hash.replace(/^#/, '')).get(KEY);
	return value === null ? null : decode(value);
}
