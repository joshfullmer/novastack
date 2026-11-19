/**
 * The "copy the ingest command" bookmarklet — `docs/runbooks/tournaments-rollout.md`.
 *
 * Clicked on a melee.gg tournament page it copies `pnpm melee <id>`; clicked on any other melee.gg
 * page (a decklist search, say) it copies one command for every tournament the page links to. The ids
 * never have to be read out by hand. It only reads the page already open (signed in or not) and
 * writes the clipboard: nothing leaves the browser, and the ingest itself stays the manual job it is
 * (spec §4), run once for the ids pasted.
 *
 * The source is plain browser JavaScript kept as a string, because a bookmarklet is a single line of
 * text with no imports. It is written without comments or line-leading-`//` so `bookmarklet()` can
 * flatten it safely.
 */
export const BOOKMARKLET_SOURCE = `
(() => {
	const idIn = (path) => (path.match(/^\\/Tournament\\/View\\/(\\d+)/i) || [])[1];
	const say = (text) => {
		const note = document.createElement('div');
		note.textContent = text;
		note.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;max-width:60ch;padding:10px 14px;border-radius:6px;background:#111;color:#fff;font:14px/1.3 ui-monospace,monospace;box-shadow:0 2px 12px #0006';
		document.body.append(note);
		setTimeout(() => note.remove(), 3500);
	};
	if (!location.hostname.endsWith('melee.gg')) return say('Open a melee.gg page first.');
	const here = idIn(location.pathname);
	const linked = [...document.querySelectorAll('a[href*="/Tournament/View/"]')].map((a) => idIn(new URL(a.href, location.href).pathname));
	const ids = [...new Set(here ? [here] : linked.filter(Boolean))];
	if (!ids.length) return say('No tournaments found on this page.');
	const command = 'pnpm melee ' + ids.join(' ');
	const what = ids.length === 1 ? command : ids.length + ' events';
	navigator.clipboard.writeText(command).then(
		() => say('Copied: ' + what),
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
