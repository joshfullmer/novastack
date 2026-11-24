import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { PageServerLoad } from './$types';

// The bookmarklet page is a maintainer's tool: ingest runs from a terminal on their own machine
// (`pnpm melee`), so on the deployed site there is nothing for a visitor to do here and it is a 404
// rather than an unlisted page someone could stumble on. Only `vite dev` serves it.
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
};
