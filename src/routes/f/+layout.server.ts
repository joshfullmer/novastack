import type { LayoutServerLoad } from './$types';

/** Same job as `/d/+layout.server.ts` — Nav needs sign-in state on a page reachable from a shared
 * link by anyone. */
export const load: LayoutServerLoad = (event) => {
	return { user: event.locals.user };
};
