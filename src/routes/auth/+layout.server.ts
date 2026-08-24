import type { LayoutServerLoad } from './$types';

/** So Nav shows accurate sign-in state on the auth pages too. */
export const load: LayoutServerLoad = (event) => {
	return { user: event.locals.user };
};
