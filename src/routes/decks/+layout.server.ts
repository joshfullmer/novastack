import type { LayoutServerLoad } from './$types';

/** Shared by `/decks` and `/decks/[id]` — lets Nav show accurate sign-in state on this
 * subtree without adding it to the static, prerendered pages (which never invoke the Worker). */
export const load: LayoutServerLoad = (event) => {
	return { user: event.locals.user };
};
