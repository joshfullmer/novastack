/**
 * The old folder-share URL, kept alive as a permanent redirect to `/f/[code]`. Same reasoning,
 * same shape and same caveats as `/decks/[id]/+server.ts` — see that file.
 *
 * One difference: a missing folder 404s here without distinguishing "never existed" from "private
 * and not yours", matching what the destination does. A folder id was only ever handed out in a
 * share link, so confirming existence to whoever holds one costs nothing — but staying consistent
 * with the destination means the redirect can't be used to probe for folders either.
 */
import { error, redirect } from '@sveltejs/kit';
import { getFolderByRef } from '#lib/server/db/folders.js';
import { ensureFolderShareCode } from '#lib/server/db/share-codes.js';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
	const folder = await getFolderByRef(event.locals.db, event.params.id);
	if (!folder) return error(404, 'Folder not found');
	return redirect(301, `/f/${await ensureFolderShareCode(event.locals.db, folder)}`);
};
