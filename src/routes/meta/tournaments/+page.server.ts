import { readViewPref } from '#lib/server/view-pref.js';
import { getEventList } from '#lib/server/db/tournaments.js';
import { fetchPage } from '#lib/server/paging.js';
import { parseEventQuery } from '#lib/tournaments/event-list.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — the list is whatever has been ingested so far.
export const prerender = false;

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const query = parseEventQuery(url.searchParams);
	return {
		...(await fetchPage(query.page, (page) =>
			locals.cached('getEventList', { ...query, page }, () =>
				getEventList(locals.db, { ...query, page })
			)
		)),
		// List or Gallery, remembered in a cookie like the app's other toggles of this kind.
		view: readViewPref(cookies, 'tournaments-list-view', ['list', 'gallery'], 'list')
	};
};
