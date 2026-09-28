import type { LayoutServerLoad } from './$types';

/** Same job as `/decks/+layout.server.ts`, for the canonical deck-view subtree (`/d/[code]`) —
 * lets Nav show accurate sign-in state on a page that anyone, signed in or not, can land on from
 * a shared link. */
export const load: LayoutServerLoad = (event) => {
	return { user: event.locals.user };
};
