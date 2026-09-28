/**
 * The short share link for a **printing list** — a Binder or a Wantlist (`/l/{code}`).
 *
 * A resolver rather than a renderer, which is the one place this design differs from `/d` and `/f`.
 * Those two moved their pages to the short path outright; these don't, because
 * `/collection/binders/[id]` and `/collection/wantlists/[id]` are also where the **owner manages**
 * the list, reached from `/collection`'s own navigation. Hosting the management UI at an opaque
 * `/l/{code}` would have cost more in orientation than the shorter address bar is worth, and
 * rendering it at both paths would mean two canonical URLs for one page.
 *
 * So `/l/{code}` is what you paste, and it lands on the list's real home — with the **code** in the
 * URL rather than the UUID, since both routes accept either (`getBinder`, `getWantlist`). A
 * share link is therefore short, and where it lands is still short and self-describing:
 * `/collection/binders/k7m2qx9v4t`.
 *
 * `302`, not `301`: unlike a deck's moved view, this is a redirect *by kind*, and a list's kind is
 * a column. Nothing changes it today, but a permanent cache entry is the wrong bet on a mapping the
 * database owns rather than the URL scheme.
 */
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { normalizeShareCode } from '#lib/short-id.js';
import { printingLists } from '#lib/server/db/schema.js';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
	const code = normalizeShareCode(event.params.code);
	// Not a code at all — a truncated paste, or somebody exploring. Nothing to resolve, and no
	// reason to make the database say so.
	if (code === null) return error(404, 'Not found');

	const [list] = await event.locals.db
		.select({ kind: printingLists.kind, shareCode: printingLists.shareCode })
		.from(printingLists)
		.where(eq(printingLists.shareCode, code))
		.limit(1);

	// Visibility is checked by the destination, which 404s a private list for a non-owner. This hop
	// deliberately doesn't pre-empt that: it only confirms a code the requester already had.
	if (!list) return error(404, 'Not found');

	const home = list.kind === 'binder' ? 'binders' : 'wantlists';
	return redirect(302, `/collection/${home}/${list.shareCode}`);
};
