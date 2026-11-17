/**
 * Pages that are the same for everyone and only read: they never ask who is looking, so the request
 * hook gives them a database and nothing else. Skipping `createAuth` and the session lookup is most of
 * what a request to them would otherwise cost beyond its own queries.
 *
 * Only a **read** of a **listed** prefix qualifies. A page here must not read `locals.user`,
 * `locals.session` or `locals.auth` (they are never set on it), and must not need the username gate
 * (`hooks.server.ts`): someone signed in without a username is not sent to pick one from these pages.
 *
 * The signed-in hint cookie is not refreshed on them either; the next request to any other dynamic
 * route heals it, as `signed-in-hint.ts` describes.
 */
const PUBLIC_PREFIXES = ['/tournaments'];

/** `/tournaments` and what is under it, not `/tournaments-old`. */
const under = (pathname: string, prefix: string) =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

export const isPublicRead = (method: string, pathname: string) =>
	(method === 'GET' || method === 'HEAD') &&
	PUBLIC_PREFIXES.some((prefix) => under(pathname, prefix));
