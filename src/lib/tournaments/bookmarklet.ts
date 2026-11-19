/**
 * The "copy the ingest command" bookmarklet — `docs/runbooks/tournaments-rollout.md`.
 *
 * Clicked on a melee.gg tournament page, it copies `pnpm melee <id>` so the id never has to be read
 * out of the address bar by hand. It only reads the address and writes the clipboard: nothing leaves
 * the browser, and the ingest itself stays the manual, one-id-at-a-time job it is (spec §4).
 *
 * The source is plain browser JavaScript kept as a string, because a bookmarklet is a single line of
 * text with no imports. It is written without comments or line-leading-`//` so `bookmarklet()` can
 * flatten it safely.
 */
export const BOOKMARKLET_SOURCE = `
(() => {
	const found = location.hostname.endsWith('melee.gg') && location.pathname.match(/^\\/Tournament\\/View\\/(\\d+)/i);
	const say = (text) => {
		const note = document.createElement('div');
		note.textContent = text;
		note.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;padding:10px 14px;border-radius:6px;background:#111;color:#fff;font:14px/1.3 ui-monospace,monospace;box-shadow:0 2px 12px #0006';
		document.body.append(note);
		setTimeout(() => note.remove(), 2500);
	};
	if (!found) return say('Open a melee.gg tournament page (…/Tournament/View/<id>) first.');
	const command = 'pnpm melee ' + found[1];
	navigator.clipboard.writeText(command).then(
		() => say('Copied: ' + command),
		() => prompt('Copy this:', command)
	);
})();
`;

/** A `javascript:` URL that runs `source` — one line, percent-encoded so it survives being an `href`. */
export const bookmarklet = (source: string = BOOKMARKLET_SOURCE): string =>
	'javascript:' +
	encodeURIComponent(
		source
			.split('\n')
			.map((line) => line.trim())
			.join('')
	);
